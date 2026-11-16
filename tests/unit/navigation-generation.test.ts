import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { navigation, reconcileBookWorkbenchApi } from '../../src/renderer/navigation-generation.js';
import { installMiniDom, miniDocument, type MiniElement } from '../support/mini-dom.js';

// Execute the private shell loaders, as the existing renderer composition tests do,
// without starting the application or replacing the production navigation code.
const source = ts.createSourceFile('index.ts', readFileSync(new URL('../../src/renderer/index.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const names = ['renderGlobalAgent', 'renderResolvedBookWorkbenchRoute', 'renderBookAnalysis', 'leaveThen', 'openTaskNotification', 'replaceScreen', 'openBookSection', 'requestBookWorkbenchRoute', 'guardNavigationRead', 'openEditorWindow', 'renderBookManuscript', 'openGlobalAttentionTarget', 'renderBookEvaluation', 'agentWorkspaceReturn', 'openProductionDocument', 'renderKeyboardSettings', 'renderProposalConflict', 'abandonAndContinue', 'renderBookCreationForm'];
const declarations = source.statements.filter((node) => ts.isFunctionDeclaration(node) && names.includes(node.name?.text.replace(/Now$/u,'') ?? ''));
const settingsSource = ts.createSourceFile('model-service-settings.ts', readFileSync(new URL('../../src/renderer/model-service-settings.ts', import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
let settingsLoader='';
function findSettings(node:ts.Node):void {if(ts.isFunctionDeclaration(node)&&node.name?.text==='renderModelServiceSettings')settingsLoader=node.getText(settingsSource);ts.forEachChild(node,findSettings);}
findSettings(settingsSource);
const importSource = ts.createSourceFile('import-review.ts', readFileSync(new URL('../../src/renderer/import-review.ts', import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
const importLoaders:string[]=[];
function findImportLoaders(node:ts.Node):void {if(ts.isFunctionDeclaration(node)&&['finishImport','finishSourceImport'].includes(node.name?.text??''))importLoaders.push(node.getText(importSource));ts.forEachChild(node,findImportLoaders);}
findImportLoaders(importSource);
const program = ts.transpileModule(declarations.map((node) => node.getText(source)).join('\n')+'\n'+settingsLoader+'\n'+importLoaders.join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
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
  const actions=new Map<string,()=>void|Promise<void>>();
  const element = (tag: string, className?: string, text?: string) => {
    const node = document.createElement(tag); if (className) node.className = className; if (text) node.textContent = text;
    node.focus = focus; return node;
  };
  let context: ReturnType<typeof createContext>;
  const replaceScreen = (state: string, node = element('section')) => {
    context['replacement'] = node;
    runInContext(`replaceScreen(${JSON.stringify(state)}, replacement)`, context);
  };
  const shell = { leaveBook: vi.fn(), follow: vi.fn() };
  const renderBookOverview = vi.fn((overview: { book: { bookId: string } }) => replaceScreen(overview.book.bookId, undefined));
  const renderBaselineAnalysis = vi.fn((host: HTMLElement) => host.append(element('p', '', '已读取分析')));
  const guardedApi = reconcileBookWorkbenchApi(api as never, {bookOnScreen:()=>navigation.bookId,editorOnScreen:()=>{const editor=context?.['manuscriptOnScreen'] as {manuscriptId:string;branchId:string}|null;return editor&&editor.manuscriptId?{manuscriptId:editor.manuscriptId,branchId:editor.branchId}:null;},left:()=>shell.leaveBook(),failed:vi.fn()},navigation);
  context = createContext({ navigation, shellNavigation:navigation, rememberActionDefaults:async()=>undefined, hasErrorCode:()=>false, renderImported:vi.fn(), queueMicrotask, api: guardedApi, rendererApi: guardedApi, window: { ai7: guardedApi }, document, screen, shell, setStatus,
    mountGlobalAgent: vi.fn(() => element('section')), renderBookOverview, renderBaselineAnalysis,
    HTMLElement, SETTINGS_HUB_GROUPS: [], settingsNavigation:()=>element('nav'), overviewDrawerBookId: null, screenReturns: {enter: vi.fn()},
    restoreCurrentScreen: vi.fn(), currentRecoveryReturn: () => undefined, recoveryReturnContexts: new WeakMap(),
    manuscriptOnScreen: null, taskResultWindow: null, authorityInterrupted: false, keyboardSettingsOff: undefined,
    reviewWorkspace: undefined, deliverablesSurface: undefined, derivativesSurface: undefined, proposalWorkspaceSurface: undefined,
    agentWorkspaceSurface: undefined, proposalConflictSurface: undefined, globalAttentionSurface: undefined, taskOverviewSurface: undefined,
    leaveGuard: null, taskDrawer: {followScreen: vi.fn()}, globalAttentionReader: {refresh: vi.fn()}, refreshCommandEntries: vi.fn(),
    SHELL_LABELS: {openingBook:'正在打开图书',bookUnavailable:'无法打开图书'},
    renderBookReview: vi.fn((bookId:string) => {const node=element('section');node.dataset['bookId']=bookId;replaceScreen('book-review',node);}),
    element, panel: () => element('section'), agentWorkspaceReturns: new WeakMap(), taskSurfaceRefresh: {},
    mountBackgroundAnalysis: vi.fn(), rendererErrorMessage: (_error: unknown, fallback: string) => fallback,
    settleScreen: vi.fn(async () => true),
    AGENT_WORKSPACE_RETURN_SECTIONS: {},
    modelServiceChannel:null,modelChoices:new Map(),modelFilters:new Map(),favourites:[],
    paintModelServiceSettings:()=>replaceScreen('model-service'),focusSearchSettings:vi.fn(),
    KEYBOARD_SECTION_LABEL:'键盘',KEYBOARD_TITLE:'键盘与无障碍',USAGE_RETURN:'返回',
    mountKeyboardSettings:()=>vi.fn(),applyKeyboardBindings:vi.fn(),
    button:(label:string,_class:string,run:()=>void)=>{const button=element('button','',label);button.addEventListener('click',run);actions.set(label,run);return button;},
    renderEditorWindow: vi.fn((window:{bookId:string}) => {const node=element('section');node.dataset['bookId']=window.bookId;replaceScreen('editor',node);}),
    mountProposalConflict:vi.fn((options)=>{context['conflictOptions']=options;return {start:vi.fn(),destroy:vi.fn(),settle:async()=>true};}),
    conflictCompletionOn:(onDocument:boolean)=>onDocument?'文档结果':'修改已应用',documentContextOf:async()=>({}),technicalWords:(_technical:string,ordinary:string)=>ordinary,renderStartupProjection:vi.fn(),
    mountEvaluation: vi.fn((options) => {context['evaluationOptions']=options;return {load:async()=>undefined,refresh:vi.fn()};}),
    technicalDetails: vi.fn(), awaitServiceJob: vi.fn(), openTaskPlan: vi.fn(),
    EVALUATION_STATUS: {loading:'正在读取评估',opened:'评估已打开',unavailable:'无法读取评估'},
    renderTaskOverview: vi.fn(), openOverviewTask: vi.fn(), openOverviewResult: vi.fn(),
  });
  runInContext(program, context);
  return { screen, setStatus, focus, shell, context, actions, renderBookOverview, renderBaselineAnalysis, replaceScreen,
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
  page.replaceScreen('model-service', undefined);
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
  const bookNode=document.createElement('section');bookNode.dataset['bookId']='book-a';page.replaceScreen('book-review',bookNode);
  let first: Promise<void>, second: Promise<void>;
  if(order==='leave-first') {
    first=page.run('renderGlobalAgent()'); second=page.run("openBookSection({bookId:'book-a',title:'图书'},'review')");
  } else {
    first=page.run("openBookSection({bookId:'book-a',title:'图书'},'review')"); await routeStarted.promise; second=page.run('renderGlobalAgent()');
    routeRead.resolve({kind:'book',bookId:'book-a',bookTitle:'图书'});
  }
  await Promise.resolve(); await Promise.resolve(); leave.resolve(); await Promise.all([first,second]);
  if(order==='leave-first') {expect(page.screen.dataset['screen']).toBe('book-review'); expect(owned).toBe('book-a'); expect(calls).toEqual(['leave','left','open','route']);}
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


it('the real keyboard destination supersedes a pending model-settings read without begin', async () => {
 const read=Promise.withResolvers<object>(); const page=harness({getModelServiceSettings:()=>read.promise,getPreferences:async()=>({values:{'model.favourites':[]}})});
 page.replaceScreen('settings'); const pending=page.run('renderModelServiceSettings()');
 await page.run('renderKeyboardSettings()'); read.resolve({}); await pending;
 expect(page.screen.dataset['screen']).toBe('keyboard');
});

it.each(['book','tab'])('the shell derives a different %s identity without a caller flag', async (change) => {
 const page=harness(); const first=document.createElement('section'),second=document.createElement('section');
 if(change==='book') {first.dataset['bookId']='book-a';second.dataset['bookId']='book-b';}
 else {first.dataset['knowledgeTab']='home';second.dataset['knowledgeTab']='guidelines';}
 page.replaceScreen(change==='book'?'book-review':'knowledge-base',first); const pending=navigation.route();
 page.replaceScreen(change==='book'?'book-review':'knowledge-base',second);
 expect(pending.isCurrent()).toBe(false);
});

it.each(['derivative','refused-exit'])('the shared API boundary restores the visible Book after a superseded leave (%s)', async (next) => {
 const leave=Promise.withResolvers<void>();let owned:string|null='book-a';let capability=false;const calls:string[]=[];
 const page=harness({
  leaveBookWorkbench:async()=>{calls.push('leave');await leave.promise;owned=null;capability=false;calls.push('left');return {state:'library'};},
  openBookWorkbench:async()=>{calls.push('reacquire');owned='book-a';return {target:'requesting-window',route:{kind:'book',bookId:owned}};},
  getManuscriptWindow:async()=>{calls.push('window');if(owned!=='book-a')throw new Error('AI7_EDITOR_ROUTE_INVALID');capability=true;return {bookId:owned};},
  flushJournalEdit:async()=>{calls.push('scoped');if(owned!=='book-a'||!capability)throw new Error('AI7_EDITOR_ROUTE_INVALID');return {bookId:owned};},
 });
 const book=document.createElement('section');book.dataset['bookId']='book-a';page.replaceScreen(next==='refused-exit'?'editor':'book-review',book);
 if(next==='refused-exit')page.context['manuscriptOnScreen']={bookId:'book-a',manuscriptId:'document',branchId:'branch',readingPlace:()=>null,destroy:vi.fn()};
 const pending=page.run('renderGlobalAgent()'); let nextAction:Promise<void>;
 if(next==='derivative') nextAction=page.run("openProductionDocument({documentId:'document',branchId:'branch'}, {typeId:'type',label:'稿件'}, '图书')");
 else {page.context['settleScreen']=async()=>false;nextAction=page.run('leaveThen(() => renderGlobalAgent())');}
 await Promise.resolve();expect(calls).toEqual(['leave']);leave.resolve();await Promise.all([pending,nextAction]);
 const result=await page.run("api.flushJournalEdit({manuscriptId:'document',branchId:'branch'})");expect(result).toEqual({bookId:'book-a'});
 expect(page.screen.dataset['screen']).toBe('editor');
 expect(calls).toEqual(['leave','left','reacquire','window','scoped']);
});


it('conflict success is announced after leaving while its navigation follow-up stays on the origin', async () => {
 const windowRead=vi.fn(async()=>({bookId:'book-a'}));const page=harness({getManuscriptWindow:windowRead});
 await page.run("renderProposalConflict({bookId:'book-a',manuscriptId:'manuscript',branchId:'branch',markId:'mark'},'图书')");
 const options=page.context['conflictOptions'] as {returnToManuscript(at:null,completion:string):Promise<void>};
 page.replaceScreen('knowledge-base');page.setStatus.mockClear();
 await options.returnToManuscript(null,'applied');
 expect(page.setStatus).toHaveBeenCalledWith('修改已应用','success');expect(windowRead).not.toHaveBeenCalled();
 expect(page.screen.dataset['screen']).toBe('knowledge-base');
});


it('an abandoned-import acknowledgement preserves the newer destination and still announces success', async () => {
 const write=Promise.withResolvers<object>();const page=harness({abandonImportDraft:()=>write.promise});
 page.replaceScreen('import-review');const pending=page.run("abandonAndContinue({draftId:'draft',draftVersion:1})");
 page.replaceScreen('knowledge-base');write.resolve({state:'none'});await pending;
 expect(page.context['renderStartupProjection']).not.toHaveBeenCalled();
 expect(page.setStatus).toHaveBeenCalledWith('已放弃本次导入','success');expect(page.screen.dataset['screen']).toBe('knowledge-base');
});

it('a nested return read error still reports while the workspace stays', async () => {
 const read=Promise.withResolvers<object>(),started=Promise.withResolvers<void>();
 const page=harness({getBookOverview:()=>{started.resolve();return read.promise;}});
 const node=document.createElement('section');node.dataset['bookId']='book-a';page.replaceScreen('book-review',node);
 (page.context['agentWorkspaceReturns'] as WeakMap<HTMLElement,()=>Promise<void>>).set(node,()=>page.run("renderResolvedBookWorkbenchRoute({kind:'book',bookId:'book-a'})"));
 const back=runInContext("agentWorkspaceReturn('book-a','图书')",page.context) as ()=>void;back();await started.promise;
 read.reject(new Error('read failed'));for(let i=0;i<12;i+=1)await Promise.resolve();
 expect(page.setStatus).toHaveBeenCalledWith('无法打开图书','error');
});


it('conflict success keeps its document wording after its own destination commits', async () => {
 const page=harness({getManuscriptWindowAt:async()=>({bookId:'book-a',deliverable:'production-document'})});
 await page.run("renderProposalConflict({bookId:'book-a',manuscriptId:'manuscript',branchId:'branch',markId:'mark'},'图书')");
 const options=page.context['conflictOptions'] as {returnToManuscript(at:{blockId:string;markId:null},completion:string):Promise<void>};
 await options.returnToManuscript({blockId:'block',markId:null},'kept');
 expect(page.screen.dataset['screen']).toBe('editor');expect(page.setStatus).toHaveBeenLastCalledWith('文档结果','success');
});

it.each(['finishImport','finishSourceImport'])('an import acknowledgement preserves a later pending click (%s)', async (loader) => {
 const write=Promise.withResolvers<object>();
 const page=harness({commitNewBookImport:()=>write.promise,commitSourceImport:()=>write.promise});
 page.replaceScreen('import-review');
 const pending=page.run(`${loader}({reviewDigest:'digest',draftId:'draft',draftVersion:1,commitAttemptId:'attempt'})`);
 const later=navigation.begin();
 write.resolve({bookId:'book-a',completionLabel:'导入已完成'});await pending;
 expect(page.context['renderImported']).not.toHaveBeenCalled();expect(later.isCurrent()).toBe(true);
 expect(page.setStatus).toHaveBeenCalledWith('导入已完成','success');
});

it('a new Book acknowledgement preserves a later pending click', async () => {
 const write=Promise.withResolvers<object>(),started=Promise.withResolvers<void>();
 const page=harness({prepareBookCreation:async()=>({proposed:{},reviewDigest:'digest'}),commitBookCreation:()=>{started.resolve();return write.promise;}});
 await page.run('renderBookCreationForm()');
 page.screen.querySelector<HTMLInputElement>('[id="empty-book-title"]')!.value='图书';
 page.screen.querySelector<HTMLInputElement>('[id="empty-book-number"]')!.value='';
 const pending=page.actions.get('新建图书')!();await started.promise;
 const later=navigation.begin();write.resolve({overview:{book:{bookId:'book-a'}},completionLabel:'图书已创建'});await pending;
 expect(page.renderBookOverview).not.toHaveBeenCalled();expect(later.isCurrent()).toBe(true);
 expect(page.setStatus).toHaveBeenCalledWith('图书已创建','success');
});

it('an import keeps the click checkpoint across preparation and commit', async () => {
 const write=Promise.withResolvers<object>();const page=harness({commitNewBookImport:()=>write.promise});
 page.replaceScreen('import-review');page.context['follow']=navigation.route();
 const later=navigation.begin();
 const pending=page.run("finishImport({reviewDigest:'digest',draftId:'draft',draftVersion:1,commitAttemptId:'attempt'},undefined,follow)");
 write.resolve({bookId:'book-a',completionLabel:'导入已完成'});await pending;
 expect(page.context['renderImported']).not.toHaveBeenCalled();expect(later.isCurrent()).toBe(true);
 expect(page.setStatus).toHaveBeenCalledWith('导入已完成','success');
});

it('abandoning import preserves a later click while its destination is still pending', async () => {
 const write=Promise.withResolvers<object>();const page=harness({abandonImportDraft:()=>write.promise});
 page.replaceScreen('import-review');const pending=page.run("abandonAndContinue({draftId:'draft',draftVersion:1})");
 const later=navigation.begin();write.resolve({state:'none'});await pending;
 expect(page.context['renderStartupProjection']).not.toHaveBeenCalled();expect(later.isCurrent()).toBe(true);
 expect(page.setStatus).toHaveBeenCalledWith('已放弃本次导入','success');
});

it('a pending leave gates Book calls while unrelated knowledge reads finish immediately', async () => {
 const answer=Promise.withResolvers<void>();const scoped=vi.fn(async()=>({bookId:'book-a'})),knowledge=vi.fn(async()=>({profiles:[]}));
 const page=harness({leaveBookWorkbench:()=>answer.promise,getManuscriptWindow:scoped,inspectEvaluationProfiles:knowledge});
 const leaving=page.run('renderGlobalAgent()');
 const waiting=page.run("api.getManuscriptWindow({manuscriptId:'manuscript',branchId:'branch',cursor:null})");
 await page.run('api.inspectEvaluationProfiles()');
 expect(knowledge).toHaveBeenCalledOnce();expect(scoped).not.toHaveBeenCalled();
 answer.resolve();await Promise.all([leaving,waiting]);expect(scoped).toHaveBeenCalledOnce();
});

it('the real shell distinguishes the primary manuscript and derivative documents', () => {
 const page=harness();const primary=document.createElement('section'),derivative=document.createElement('section');
 primary.dataset['bookId']='book-a';derivative.dataset['bookId']='book-a';derivative.dataset['documentId']='document-a';
 page.replaceScreen('editor',primary);const pending=navigation.route();page.replaceScreen('editor',derivative);
 expect(pending.isCurrent()).toBe(false);
});

it('opening another conflict supersedes pending navigation without an explicit begin', async () => {
 const page=harness();await page.run("renderProposalConflict({bookId:'book-a',manuscriptId:'manuscript',branchId:'branch',markId:'first'},'图书')");
 const pending=navigation.route();
 const options=page.context['conflictOptions'] as {openConflict(markId:string):void};options.openConflict('second');
 expect(pending.isCurrent()).toBe(false);expect(page.screen.firstElementChild?.getAttribute('data-conflict-mark-id')).toBe('second');
});
