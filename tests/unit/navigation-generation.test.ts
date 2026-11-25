import { styleInput } from '../../src/renderer/components/controls.js';
import { localDayTimeLabel } from '../../src/shared/report-wording.js';
import { visibleGlobalAttention } from '../../src/renderer/global-attention.js';
import { rendererErrorMessage } from '../../src/renderer/error-words.js';
import { finishedResultRoute } from '../../src/renderer/result-destination.js';
import { showOnboardingCard } from '../../src/shared/preferences.js';
import { createNotificationObserver, createStatusSurface, openCurrentBookCompletion } from '../../src/renderer/notifications.js';
import { composeTaskOverview } from '../../src/service/task-overview.js';
import type { GlobalAttentionItemProjection, GlobalAttentionProjection, TaskOverviewProjection } from '../../src/shared/protocol.js';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { navigation, reconcileBookWorkbenchApi, BookHeldElsewhereError, BookOwnershipFailure, bookOwnershipFailureLine, sendJournalEdit, focusAfterLoad } from '../../src/renderer/navigation-generation.js';
import { installMiniDom, miniDocument, MiniElement } from '../support/mini-dom.js';
import { mountTaskDrawer } from '../../src/renderer/task-drawer.js';

// Execute the private shell loaders, as the existing renderer composition tests do,
// without starting the application or replacing the production navigation code.
const source = ts.createSourceFile('index.ts', readFileSync(new URL('../../src/renderer/index.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
const names = ['openResult', 'openResultWindow', 'openGlobalAttentionItem', 'renderTaskOverview', 'renderBookReview', 'renderGlobalAgent', 'renderResolvedBookWorkbenchRoute', 'renderBookAnalysis', 'leaveThen', 'openTaskNotification', 'replaceScreen', 'openBookSection', 'requestBookWorkbenchRoute', 'guardNavigationRead', 'openEditorWindow', 'renderBookManuscript', 'openGlobalAttentionTarget', 'renderBookEvaluation', 'agentWorkspaceReturn', 'openProductionDocument', 'renderKeyboardSettings', 'renderProposalConflict', 'abandonAndContinue', 'renderBookCreationForm', 'initializeStartup', 'renderApplicationStartup', 'renderError', 'reportBookReacquisitionFailure', 'clearBookReacquisitionNotice', 'withConflictCompletion', 'renderBookFilter', 'jumpToManuscript'];
const declarations: string[] = [];
let libraryLanding = '';
for (const module of [source, ...['global-pages', 'settings-screens', 'library-screen'].map((name) => ts.createSourceFile(name + '.ts', readFileSync(new URL('../../src/renderer/' + name + '.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true))]) {
 function collect(node: ts.Node): void {
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'renderLanding') libraryLanding = node.getText(module).replace(/(?<![\w$.])state\./gu, '');
  if (ts.isFunctionDeclaration(node) && names.includes(node.name?.text.replace(/Now$/u, '') ?? '')) declarations.push(node.getText(module).replace(/(?<![\w$.])state\./gu, ''));
  ts.forEachChild(node, collect);
 }
 collect(module);
}
const settingsSource = ts.createSourceFile('model-service-settings.ts', readFileSync(new URL('../../src/renderer/model-service-settings.ts', import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
let settingsLoader='';
function findSettings(node:ts.Node):void {if(ts.isFunctionDeclaration(node)&&node.name?.text==='renderModelServiceSettings')settingsLoader=node.getText(settingsSource);ts.forEachChild(node,findSettings);}
findSettings(settingsSource);
const importSource = ts.createSourceFile('import-review.ts', readFileSync(new URL('../../src/renderer/import-review.ts', import.meta.url),'utf8'),ts.ScriptTarget.Latest,true);
const importLoaders:string[]=[];
function findImportLoaders(node:ts.Node):void {if(ts.isFunctionDeclaration(node)&&['finishImport','finishSourceImport','presentImportCompletion'].includes(node.name?.text??''))importLoaders.push(node.getText(importSource));ts.forEachChild(node,findImportLoaders);}
findImportLoaders(importSource);
let failureCallback='';
function findFailureCallback(node:ts.Node):void {if(ts.isCallExpression(node)&&node.expression.getText(source)==='reconcileBookWorkbenchApi'&&node.arguments[1]&&ts.isObjectLiteralExpression(node.arguments[1])){const property=node.arguments[1].properties.find((entry)=>entry.name?.getText(source)==='failed');if(property&&ts.isPropertyAssignment(property))failureCallback=property.initializer.getText(source);}ts.forEachChild(node,findFailureCallback);}
findFailureCallback(source);
let completionObserverOptions = '';
// The notices of finished tasks live in task-notices.ts (#1528): its watching rule and its observer, run as they are written.
const noticeSource = ts.createSourceFile('task-notices.ts', readFileSync(new URL('../../src/renderer/task-notices.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
let watchingRule = '';
function findCompletionObserver(node: ts.Node): void {
 if (ts.isCallExpression(node) && node.expression.getText(noticeSource) === 'createNotificationObserver') completionObserverOptions = node.arguments[0]!.getText(noticeSource);
 if (ts.isFunctionDeclaration(node) && node.name?.text === 'canAutoOpenTaskResult') watchingRule = node.getText(noticeSource);
 ts.forEachChild(node, findCompletionObserver);
}
findCompletionObserver(noticeSource);
// The entrances of 查看结果 that are written inside index.ts's wiring, run as they are written (#1528).
const sites: Record<string, string> = {};
function findSites(node: ts.Node): void {
 if (ts.isPropertyAssignment(node)) {
  const name = node.name.getText(source), text = node.initializer.getText(source);
  if (name === 'openTaskResult' && text.includes('finishedResultRoute')) sites['panel'] = text;
  if (name === 'openResult' && text.includes("'palette'")) sites['palette'] = text;
  if (name === 'openResult' && text.includes('openTaskNotification')) sites['toast'] = text;
 }
 ts.forEachChild(node, findSites);
}
findSites(source);
const program = ts.transpileModule(declarations.join('\n')+'\n'+watchingRule+'\n'+settingsLoader+'\n'+importLoaders.join('\n')+'\nvar reportReacquisitionFailure='+failureCallback+'; var completionObserverOptions='+completionObserverOptions+'; var panelSite='+sites['panel']+'; var paletteSite='+sites['palette']+'; var toastSite='+sites['toast']+';', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const manuscriptSource = ts.createSourceFile('manuscript-screen.ts', readFileSync(new URL('../../src/renderer/manuscript-screen.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
let journalSender='';
function findJournalSender(node:ts.Node):void { if(ts.isPropertyAssignment(node)&&node.name.getText(manuscriptSource)==='flushJournalEdit')journalSender=node.initializer.getText(manuscriptSource);ts.forEachChild(node,findJournalSender); }
findJournalSender(manuscriptSource);
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
    Object.defineProperty(node,'childNodes',{get:()=>node.children}); node.focus = focus; return node;
  };
  let context: ReturnType<typeof createContext>;
  const replaceScreen = (state: string, node = element('section')) => {
    context['replacement'] = node;
    runInContext(`replaceScreen(${JSON.stringify(state)}, replacement)`, context);
  };
  const shell = { leaveBook: vi.fn(), follow: vi.fn() };
  const renderBookOverview = vi.fn((overview: { book: { bookId: string } }) => replaceScreen(overview.book.bookId, undefined));
  const renderBaselineAnalysis = vi.fn((host: HTMLElement) => host.append(element('p', '', '已读取分析')));
 const guardedApi = reconcileBookWorkbenchApi({acknowledgeImportCompletion:async()=>undefined,inspectGlobalAttention:async()=>({groups:[]}),inspectTaskOverview:async()=>({groups:[]}),getPreferences:async()=>({values:{'onboarding.state':'skipped'}}),getProductDataLocation:async()=>({}),getModelServiceSettings:async()=>({roles:[]}),...api} as never, {bookOnScreen:()=>navigation.bookId,editorOnScreen:()=>{const editor=context?.['manuscriptOnScreen'] as {manuscriptId:string;branchId:string}|null;return editor&&editor.manuscriptId?{manuscriptId:editor.manuscriptId,branchId:editor.branchId}:null;},left:()=>shell.leaveBook(),failed:(error,retry)=>(context['reportReacquisitionFailure'] as (error:unknown,retry:()=>Promise<void>)=>void)(error,retry),recovered:()=>{(context['clearBookReacquisitionNotice'] as ()=>void)();}},navigation);
  context = createContext({ localDayTimeLabel, visibleGlobalAttention, technicalLayerVisible: false, showOnboardingCard, styleInput, navigation, BookHeldElsewhereError, BookOwnershipFailure, bookOwnershipFailureLine, sendJournalEdit, focusAfterLoad, Error, shellNavigation:navigation, rememberActionDefaults:async()=>undefined, hasErrorCode:()=>false, renderImported:vi.fn(), queueMicrotask, api: guardedApi, rendererApi: guardedApi, window: { ai7: guardedApi }, document, screen, shell, setStatus,
    localStorage: { getItem: () => 'on' }, showQuietNotice: vi.fn(), openCurrentBookCompletion, AUTO_RESULT_KEY: 'ai7.task-overview.auto-result',
    notice: { raise: vi.fn(), settle: vi.fn(), summarize: vi.fn() }, finished: [], needing: [], standing: new Set(), returning: false,
    options: { get api() { return guardedApi; }, drawerView: () => (context['taskDrawer'] as { view(): unknown }).view(), openWindow: (entry: unknown) => (context['openOverviewResult'] as (entry: unknown) => void)(entry) },
    mountTaskOverview: vi.fn(() => ({ focus: vi.fn(), destroy: vi.fn() })),
    mountReviewWorkspace: vi.fn(() => ({ start: vi.fn(), refresh: vi.fn(), destroy: vi.fn() })),
    REVIEW_STATUS_LINES: { opened: '审阅已打开' },
    mountGlobalAgent: vi.fn(() => element('section')), renderBookOverview, renderBaselineAnalysis,
    HTMLElement, settingsLayout: (_state: string, content: unknown) => content, overviewDrawerBookId: null, screenReturns: {enter: vi.fn()},
    restoreCurrentScreen: vi.fn(), currentRecoveryReturn: () => undefined, recoveryReturnContexts: new WeakMap(),
    manuscriptOnScreen: null, taskResultWindow: null, authorityInterrupted: false, keyboardSettingsOff: undefined,
    reviewWorkspace: undefined, deliverablesSurface: undefined, derivativesSurface: undefined, proposalWorkspaceSurface: undefined,
    agentWorkspaceSurface: undefined, proposalConflictSurface: undefined, globalAttentionSurface: undefined, taskOverviewSurface: undefined,
    leaveGuard: null, taskDrawer: {followScreen: vi.fn(), close: vi.fn(), view: () => null}, globalAttentionReader: {refresh: vi.fn()}, refreshCommandEntries: vi.fn(), statusSurface: {clearError: vi.fn()},
    SHELL_LABELS: {openingBook:'正在打开图书',bookUnavailable:'无法打开图书'},
    renderBookReview: vi.fn((bookId:string) => {const node=element('section');node.dataset['bookId']=bookId;replaceScreen('book-review',node);}),
    element, panel: () => element('section'), agentWorkspaceReturns: new WeakMap(), taskSurfaceRefresh: {},
    mountBackgroundAnalysis: vi.fn(), rendererErrorMessage: (_error: unknown, fallback: string) => fallback,
    settleScreen: vi.fn(async () => true),
    AGENT_WORKSPACE_RETURN_SECTIONS: {},
    modelServiceChannel:null,generation:0,opened:0,modelChoices:new Map(),flashModelChoices:new Map(),effortOtherDrafts:new Map(),effortDrafts:new Map(),modelFilters:new Map(),favourites:[],
    paintModelServiceSettings:()=>replaceScreen('model-service'),focusSearchSettings:vi.fn(),
    KEYBOARD_TITLE:'键盘与无障碍',USAGE_RETURN:'返回',
    mountKeyboardSettings:()=>vi.fn(),applyKeyboardBindings:vi.fn(),
    button:(label:string,_class:string,run:()=>void)=>{const button=element('button','',label);button.addEventListener('click',run);actions.set(label,run);return button;},
    renderEditorWindow: vi.fn((window:{bookId:string}) => {const node=element('section');node.dataset['bookId']=window.bookId;replaceScreen('editor',node);}),
    mountProposalConflict:vi.fn((options)=>{context['conflictOptions']=options;return {start:vi.fn(),destroy:vi.fn(),settle:async()=>true};}),
    conflictCompletionOn:(onDocument:boolean)=>onDocument?'文档结果':'修改已应用',documentContextOf:async()=>({}),technicalWords:(_technical:string,ordinary:string)=>ordinary,renderStartupProjection:vi.fn(),
    mountEvaluation: vi.fn((options) => {context['evaluationOptions']=options;return {load:async()=>undefined,refresh:vi.fn()};}),
    technicalDetails: vi.fn(), awaitServiceJob: vi.fn(), openTaskPlan: vi.fn(),
    EVALUATION_STATUS: {loading:'正在读取评估',opened:'评估已打开',unavailable:'无法读取评估'},
    renderTaskOverview: vi.fn(), openOverviewTask: vi.fn(), openOverviewResult: vi.fn(), openTaskResult: vi.fn(), finishedResultRoute,
    renderLanding:vi.fn(),renderError:vi.fn(),leaveReturnChip:async()=>undefined,
    BOOK_FILTER_LEGEND:'筛选',BOOK_FILTER_FIELD_LABEL:'字段',BOOK_FILTER_FIELDS:{all:'全部',title:'书名'},BOOK_FILTER_TEXT_LABEL:'词语',MAX_BOOK_SUMMARY_FILTER_CHARACTERS:100,
    BOOK_FILTER_ACTIONS:{find:'查找',clear:'显示全部图书'},BOOK_FILTER_STATUS_LINES:{finding:'查找中',found:'查找完成'},BOOK_FILTER_NONE:'没有匹配的图书',
    bookCardPeopleLine:()=>null,bookCardRelatedLine:()=>null,bookFilterLine:(filter:{text:string})=>filter.text,
    bookCardOpen:(title:string,_state:string,open:()=>void)=>{const card=element('button','',title);card.addEventListener('click',open);actions.set(title,open);return card;},
    bookCardAction:()=>element('span'),bookIdentityDisclosure:()=>element('details'),appendRecoveryReturnAction:vi.fn(),
  });
  runInContext(program+ts.transpileModule("var sendEdit="+journalSender+";",{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText, context);
  context['renderError']=vi.fn(context['renderError'] as (...args:unknown[])=>void);
  context['renderTaskOverview']=vi.fn(context['renderTaskOverview'] as (...args:unknown[])=>void);
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

// A finished task as the 任务总览 reads it, in Book B while the window shows Book A (#1528).
type Shape = 'analysis' | 'review' | 'dialogue' | 'evaluation' | 'writing' | 'analysis-bare' | 'dialogue-bare';
const SHAPES: Record<Shape, { object: object; target: object; result: object | null; plan: object | null }> = {
  analysis: { object: { kind: 'analysis', mode: 'first-baseline' }, target: { kind: 'analysis', bookId: 'book-b', taskIntentId: 'intent' }, result: { kind: 'analysis-revision', revisionId: 'rev' }, plan: { kind: 'baseline-analysis', ref: 'intent' } },
  review: { object: { kind: 'review', ordinal: 1 }, target: { kind: 'review', bookId: 'book-b', reviewRunId: 'run' }, result: { kind: 'review-run', reviewRunId: 'run' }, plan: { kind: 'review-run', ref: 'run' } },
  dialogue: { object: { kind: 'dialogue', question: null }, target: { kind: 'dialogue', bookId: 'book-b', dialogueId: 'dlg' }, result: { kind: 'dialogue', dialogueId: 'dlg' }, plan: null },
  evaluation: { object: { kind: 'task', taskKind: 'initial-evaluation' }, target: { kind: 'task-plan', bookId: 'book-b', taskKind: 'initial-evaluation', ref: 'old' }, result: null, plan: { kind: 'initial-evaluation', ref: 'finished' } },
  writing: { object: { kind: 'task', taskKind: 'writing' }, target: { kind: 'task-plan', bookId: 'book-b', taskKind: 'writing', ref: 'old' }, result: null, plan: { kind: 'writing', ref: 'finished' } },
  'analysis-bare': { object: { kind: 'analysis', mode: 'first-baseline' }, target: { kind: 'analysis', bookId: 'book-b', taskIntentId: 'intent' }, result: null, plan: { kind: 'baseline-analysis', ref: 'intent' } },
  'dialogue-bare': { object: { kind: 'dialogue', question: null }, target: { kind: 'dialogue', bookId: 'book-b', dialogueId: 'dlg' }, result: null, plan: null },
};
function finishedTask(shape: Shape) {
  const { object, target, result, plan } = SHAPES[shape];
  const attention = { itemId: 'task', group: 'recent', state: 'analysis-completed', book: { bookId: 'book-b', title: 'B' }, object, target, facts: {} };
  return { itemId: 'task', bookId: 'book-b', state: 'completed', result, plan, attention, target };
}
const OWN_PAGE = { evaluation: { kind: 'task-plan', bookId: 'book-b', taskKind: 'initial-evaluation', ref: 'finished' }, writing: { kind: 'task-plan', bookId: 'book-b', taskKind: 'writing', ref: 'finished' } };
type Entrance = 'toast' | 'palette' | 'overview' | 'panel' | 'attention';

async function entrances(shape: Shape) {
  const task = finishedTask(shape);
  const page = harness({ inspectTaskOverview: async () => ({ groups: [{ items: [task] }] }) });
  await page.run("renderBookReview('book-a','甲书')");
  const opened = vi.fn(), windowed = vi.fn(), drawer = vi.fn();
  page.context['openGlobalAttentionTarget'] = opened; page.context['openResultWindow'] = windowed; page.context['openTaskResult'] = drawer;
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
  return { task, page, opened, windowed, drawer, flush };
}

describe.each(['analysis', 'review', 'dialogue', 'evaluation', 'writing', 'analysis-bare', 'dialogue-bare'] as const)('查看结果 of a finished %s, with Book A on screen (#1528)', (shape) => {
  const route = (from: Entrance) => finishedResultRoute(finishedTask(shape) as never, from);

  it.each(['toast', 'palette'] as const)('the %s opens its page in its own Book, never the result window or the drawer of another Book', async (site) => {
    const { task, page, opened, windowed, flush } = await entrances(shape);
    const expected = route(site) as { target: unknown; analysisRevisionId?: string };
    await page.run(site === 'toast' ? `toastSite({ itemId: 'task', target: ${JSON.stringify(task.target)} })` : `paletteSite(${JSON.stringify(task)})`);
    await flush(); await flush();
    expect(windowed).not.toHaveBeenCalled();
    expect(page.context['overviewDrawerBookId']).toBeNull();
    expect(opened).toHaveBeenCalledExactlyOnceWith(expected.target, expected.analysisRevisionId);
    if (shape === 'evaluation' || shape === 'writing') expect(opened.mock.calls[0]![0]).toEqual(OWN_PAGE[shape]);
  });

  it('the 任务总览 card follows the table: a page, or the result window on the overview only', async () => {
    const { task, page, opened, windowed, flush } = await entrances(shape);
    await page.run('renderTaskOverview()');
    const options = (page.context['mountTaskOverview'] as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0] as { openResult(item: unknown): void };
    options.openResult(task); await flush();
    const expected = route('overview');
    expect(opened.mock.calls.length + windowed.mock.calls.length).toBe(1);
    if (expected.via === 'page') expect(opened).toHaveBeenCalledWith(expected.target, expected.analysisRevisionId);
    else expect(windowed).toHaveBeenCalledWith(task);
  });

  it('a 待我处理 row keeps the result window for a result to read, and sends a result-less 评估 or 写作 to its page', async () => {
    const { task, page, opened, windowed, flush } = await entrances(shape);
    await page.run(`openGlobalAttentionItem(${JSON.stringify(task.attention)})`);
    await flush();
    const expected = route('attention');
    expect(opened.mock.calls.length + windowed.mock.calls.length).toBe(1);
    if (expected.via === 'page') expect(opened).toHaveBeenCalledWith(expected.target, undefined);
    else expect(windowed).toHaveBeenCalledWith(task);
  });

  it("the Book's 任务 panel card follows the same table", async () => {
    const { task, page, opened, drawer, flush } = await entrances(shape);
    await page.run(`panelSite(${JSON.stringify({ item: task.attention, result: task.result })}, () => undefined)`);
    await flush();
    // The panel's card carries the item and its result only, so its page is the item's own target.
    const expected = finishedResultRoute({ result: task.result, attention: task.attention } as never, 'panel');
    expect(opened.mock.calls.length + drawer.mock.calls.length).toBe(1);
    if (expected.via === 'page') expect(opened).toHaveBeenCalledWith(expected.target);
    else expect(drawer).toHaveBeenCalledOnce();
  });
});

it.each([{ late: true }, { late: false }])('a finished task opens its page without the global 任务 page, and not when the answer is late (late=$late, #1528)', async ({ late }) => {
  const answer = Promise.withResolvers<object>();
  const page = harness({ inspectTaskOverview: () => answer.promise });
  const opened = vi.fn(); page.context['openGlobalAttentionTarget'] = opened;
  const task = finishedTask('evaluation');
  const pending = page.run(`openTaskNotification('task', ${JSON.stringify(task.target)})`);
  if (late) navigation.begin();
  answer.resolve({ groups: [{ items: [task] }] }); await pending;
  expect(page.context['renderTaskOverview']).not.toHaveBeenCalled();
  expect(page.context['openOverviewTask']).not.toHaveBeenCalled();
  if (late) expect(opened).not.toHaveBeenCalled();
  else expect(opened).toHaveBeenCalledExactlyOnceWith(OWN_PAGE.evaluation, undefined);
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
  const context = createContext({ navigation, BookHeldElsewhereError, page: navigation.read(root), formSlot: root, openRun,
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
 await page.run("renderProposalConflict({bookId:'book-a',manuscriptId:'manuscript',branchId:'branch',markId:'mark',onDocument:true},'图书')");
 const options=page.context['conflictOptions'] as {returnToManuscript(at:{blockId:string;markId:null},completion:string):Promise<void>};
 await options.returnToManuscript({blockId:'block',markId:null},'kept');
 expect(page.screen.dataset['screen']).toBe('editor');expect(page.setStatus).toHaveBeenLastCalledWith('文档结果','success');
 expect(page.setStatus.mock.calls.filter(([,tone])=>tone==='success')).toHaveLength(1);
});

it('keeps the conflict document wording after an attention entry and a superseded return', async () => {
 const page=harness({openBookWorkbench:async()=>({target:'requesting-window',route:{kind:'book',bookId:'book-a',bookTitle:'图书'}}),getManuscriptWindow:async()=>({bookId:'book-a',deliverable:'production-document'})});
 await page.run("openGlobalAttentionTarget({kind:'manuscript-conflict',bookId:'book-a',manuscriptId:'document',branchId:'branch',markId:'mark'})");
 const options=page.context['conflictOptions'] as {returnToManuscript(at:null,completion:string):Promise<void>};
 page.replaceScreen('knowledge-base');page.setStatus.mockClear();await options.returnToManuscript(null,'keep');
 expect(page.setStatus).toHaveBeenCalledExactlyOnceWith('文档结果','success');
 expect(page.screen.dataset['screen']).toBe('knowledge-base');
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

it.each(['finishImport','finishSourceImport'])('acknowledges a skipped import so the next library visit stays in the library (%s)', async (loader) => {
 const write=Promise.withResolvers<object>();let unacknowledged=true;
 const acknowledge=vi.fn(async()=>{unacknowledged=false;});
 const page=harness({commitNewBookImport:()=>write.promise,commitSourceImport:()=>write.promise,acknowledgeImportCompletion:acknowledge,
  getImportStartup:async()=>({state:unacknowledged?'committed-recovered':'none'})});
 page.replaceScreen('import-review');
 const pending=page.run(`${loader}({reviewDigest:'digest',draftId:'draft',draftVersion:1,commitAttemptId:'attempt'})`);
 const later=navigation.begin();write.resolve({bookId:'book-a',commitId:'commit',completionLabel:'导入已完成'});await pending;
 expect(acknowledge).toHaveBeenCalledExactlyOnceWith({commitId:'commit'});
 expect(await page.run('api.getImportStartup()')).toEqual({state:'none'});
 expect(page.context['renderImported']).not.toHaveBeenCalled();expect(later.isCurrent()).toBe(true);
 expect(page.setStatus).toHaveBeenCalledWith('导入已完成','success');
});

it('keeps the paint acknowledgement owner when the import destination is still current', async () => {
 const acknowledge=vi.fn();const page=harness({commitNewBookImport:async()=>({commitId:'commit',bookId:'book-a',completionLabel:'导入已完成'}),acknowledgeImportCompletion:acknowledge});
 page.replaceScreen('import-review');await page.run("finishImport({reviewDigest:'digest',draftId:'draft',draftVersion:1,commitAttemptId:'attempt'})");
 expect(page.context['renderImported']).toHaveBeenCalledOnce();expect(acknowledge).not.toHaveBeenCalled();
});

it('keeps acknowledgement failure visible without reopening the skipped import', async () => {
 const write=Promise.withResolvers<object>();
 const page=harness({commitNewBookImport:()=>write.promise,acknowledgeImportCompletion:async()=>{throw new Error('offline');}});
 page.replaceScreen('import-review');const pending=page.run("finishImport({reviewDigest:'digest',draftId:'draft',draftVersion:1,commitAttemptId:'attempt'})");
 page.replaceScreen('knowledge-base');write.resolve({bookId:'book-a',commitId:'commit',completionLabel:'导入已完成'});await pending;
 expect(page.context['renderImported']).not.toHaveBeenCalled();expect(page.screen.dataset['screen']).toBe('knowledge-base');
 expect(page.setStatus).toHaveBeenLastCalledWith('导入已由权威记录证明；完成提示将在下次启动时再次显示。','error');
});

it('reports a Book-section error after that flow committed its own page', async () => {
 const page=harness({getBookWorkbenchRoute:async()=>({kind:'book',bookId:'book-a',bookTitle:'图书'})});
 const error=new Error('paint failed');
 page.context['renderBookReview']=()=>{const node=document.createElement('section');node.dataset['bookId']='book-a';page.replaceScreen('book-review',node);throw error;};
 await page.run("openBookSection({bookId:'book-a',title:'图书'},'review')");
 expect(page.screen.dataset['screen']).toBe('book-review');expect(page.setStatus).toHaveBeenLastCalledWith('无法打开图书','error');
});

it('reports a startup error after that flow committed its own landing', async () => {
 const page=harness({getStartup:async()=>({state:'none',priorWork:[]}),listBooks:async()=>({books:[],nextAfter:null})});
 const error=new Error('paint failed');page.context['renderLanding']=()=>{page.replaceScreen('landing');throw error;};
 await page.run('initializeStartup()');
 expect(page.context['renderError']).toHaveBeenCalledWith(error,expect.any(Function));
});

it('reports a landing paint that rejects after reading, through the existing error path', async () => {
 const page=harness({getStartup:async()=>({state:'none',priorWork:[]}),listBooks:async()=>({books:[],nextAfter:null})});
 const error=new Error('paint failed');page.context['renderLanding']=async()=>{page.replaceScreen('landing');await Promise.resolve();throw error;};
 await page.run('initializeStartup()');
 expect(page.context['renderError']).toHaveBeenCalledWith(error,expect.any(Function));
});

it('keeps the manuscript visible when a refused second exit is followed by a failed re-acquire', async () => {
 const leave=Promise.withResolvers<void>();const page=harness({leaveBookWorkbench:()=>leave.promise,openBookWorkbench:async()=>{throw new Error('offline');}});
 const manuscript=document.createElement('section');manuscript.dataset['bookId']='book-a';page.replaceScreen('editor',manuscript);
 const pending=page.run('renderGlobalAgent()');page.context['settleScreen']=async()=>false;
 await page.run('leaveThen(() => renderGlobalAgent())');leave.resolve();await pending;
 expect(page.screen.firstElementChild===manuscript).toBe(true);expect(page.screen.dataset['screen']).toBe('editor');
 expect(page.context['renderError']).not.toHaveBeenCalled();
 expect(page.setStatus).toHaveBeenLastCalledWith('暂时无法重新连接当前图书。未保存的修改仍保留在当前页，请使用本页「重试连接当前图书」后保存。','error');
});

it('retries failed Book re-acquisition on the next save without losing the unflushed edit', async () => {
 const leave=Promise.withResolvers<void>();let owned:string|null='book-a',capability=true,dirty=true,stored=0,opens=0;
 const page=harness({leaveBookWorkbench:async()=>{owned=null;capability=false;await leave.promise;},
  openBookWorkbench:async()=>{if(++opens===1)throw new Error('offline');owned='book-a';return {target:'requesting-window'};},
  getManuscriptWindow:async()=>{if(owned!=='book-a')throw new Error('AI7_EDITOR_ROUTE_INVALID');capability=true;return {bookId:owned};},
  flushJournalEdit:async()=>{if(owned!=='book-a'||!capability)throw new Error('AI7_EDITOR_ROUTE_INVALID');stored+=1;dirty=false;return {clientEditId:'edit-1'};},
 });
 const manuscript=document.createElement('section');manuscript.dataset['bookId']='book-a';page.replaceScreen('editor',manuscript);
 page.context['manuscriptOnScreen']={bookId:'book-a',manuscriptId:'manuscript',branchId:'branch',readingPlace:()=>null,destroy:vi.fn()};
 const pending=page.run('renderGlobalAgent()');page.context['settleScreen']=async()=>!dirty;
 await page.run('leaveThen(() => renderGlobalAgent())');leave.resolve();await pending;expect(dirty).toBe(true);
 await page.run("sendEdit({manuscriptId:'manuscript',branchId:'branch',clientEditId:'edit-1'},{})");
 expect(opens).toBe(2);expect(stored).toBe(1);expect(dirty).toBe(false);expect(page.screen.firstElementChild===manuscript).toBe(true);
});

it('the on-page retry preserves the dirty editor when held elsewhere and saves after that window releases the Book', async () => {
 const leave=Promise.withResolvers<void>();let elsewhere=true,owned=false,dirty=true,saved=0;
 const open=vi.fn(async()=>{if(elsewhere)return {target:'held-elsewhere'};owned=true;return {target:'requesting-window'};});
 const page=harness({leaveBookWorkbench:()=>leave.promise,openBookWorkbench:open,
  getManuscriptWindow:async()=>{if(!owned)throw new Error('AI7_EDITOR_ROUTE_INVALID');return {bookId:'book-a'};},
  flushJournalEdit:async()=>{if(!owned)throw new Error('AI7_EDITOR_ROUTE_INVALID');dirty=false;saved+=1;},
 });
 const manuscript=document.createElement('section');manuscript.dataset['bookId']='book-a';page.replaceScreen('editor',manuscript);
 page.context['manuscriptOnScreen']={bookId:'book-a',manuscriptId:'manuscript',branchId:'branch',readingPlace:()=>null,destroy:vi.fn(),
  settle:async()=>{await page.run("api.flushJournalEdit({clientEditId:'edit-1'})");return true;}};
 const pending=page.run('renderGlobalAgent()');page.context['settleScreen']=async()=>!dirty;
 await page.run('leaveThen(() => renderGlobalAgent())');leave.resolve();await pending;
 expect(page.screen.firstElementChild).toBe(manuscript);expect(dirty).toBe(true);expect(saved).toBe(0);
 expect(page.screen.textContent).toContain('这本书已在另一个窗口打开');
 expect(page.screen.textContent).toContain('尚未写入图书');expect(page.screen.textContent).toContain('复制');
 expect(page.setStatus.mock.calls.flat().join(' ')).not.toContain('AI7_');
 expect(open).toHaveBeenCalledExactlyOnceWith({kind:'book',bookId:'book-a',activation:'non-activating'});
 await page.actions.get('重试连接当前图书')!();
 expect(open).toHaveBeenCalledTimes(2);expect(dirty).toBe(true);expect(saved).toBe(0);
 elsewhere=false;await page.actions.get('重试连接当前图书')!();
 expect(open).toHaveBeenCalledTimes(3);expect(saved).toBe(1);expect(dirty).toBe(false);
 expect(page.screen.firstElementChild).toBe(manuscript);expect(page.screen.querySelector('[data-book-reacquire]')).toBeNull();
 expect(page.setStatus).toHaveBeenLastCalledWith('已重新连接当前图书；当前修改已保存。','success');
});

it('coalesces journal-action ownership retries without blocking unrelated reads or issuing calls before recovery', async () => {
 const leave=Promise.withResolvers<void>(),retry=Promise.withResolvers<object>(),started=Promise.withResolvers<void>();let opens=0;
 const read=vi.fn(async()=>({bookId:'book-a'}));
 const page=harness({leaveBookWorkbench:()=>leave.promise,
  openBookWorkbench:async()=>{if(++opens===1)throw new Error('AI7_EDITOR_ROUTE_INVALID');started.resolve();return retry.promise;},
  flushJournalEdit:read,inspectEvaluationProfiles:async()=>({profiles:[]})});
 const book=document.createElement('section');book.dataset['bookId']='book-a';page.replaceScreen('book-review',book);
 const pending=page.run('renderGlobalAgent()');page.context['settleScreen']=async()=>false;
 await page.run('leaveThen(() => renderGlobalAgent())');leave.resolve();await pending;
 expect(opens).toBe(1);expect(page.screen.textContent).not.toContain('AI7_');
 const first=page.run("sendEdit({clientEditId:'edit-1'},{})"),second=page.run("sendEdit({clientEditId:'edit-2'},{})");
 await started.promise;expect(opens).toBe(2);expect(read).not.toHaveBeenCalled();
 await expect(page.run('api.inspectEvaluationProfiles()')).resolves.toEqual({profiles:[]});
 retry.resolve({target:'requesting-window'});await Promise.all([first,second]);
 expect(opens).toBe(2);expect(read).toHaveBeenCalledTimes(2);
});

it('reads and saves 本社词表 while a leave is pending: the list belongs to the house, not to a Book (#1543)', async () => {
 const leave=Promise.withResolvers<void>();
 const page=harness({leaveBookWorkbench:()=>leave.promise,inspectHouseWordList:async()=>({selected:null}),saveHouseWordList:async()=>({created:true})});
 const book=document.createElement('section');book.dataset['bookId']='book-a';page.replaceScreen('book-review',book);
 const pending=page.run('renderGlobalAgent()');page.context['settleScreen']=async()=>false;
 await page.run('leaveThen(() => renderGlobalAgent())');
 await expect(page.run('api.inspectHouseWordList({versionId:null,entryOffset:0,historyOffset:0})')).resolves.toEqual({selected:null});
 await expect(page.run('api.saveHouseWordList({})')).resolves.toEqual({created:true});
 leave.resolve();await pending;
});

it('the real re-acquisition notice uses editorial words even when the error formatter exposes a raw code', async () => {
 const page=harness();const manuscript=document.createElement('section');manuscript.dataset['bookId']='book-a';page.replaceScreen('editor',manuscript);
 const formatter=vi.fn((error:Error)=>error.message);page.context['rendererErrorMessage']=formatter;
 await page.run("reportBookReacquisitionFailure(new Error('AI7_EDITOR_ROUTE_INVALID'),async()=>undefined)");
 expect(page.setStatus).toHaveBeenCalledExactlyOnceWith('暂时无法重新连接当前图书。未保存的修改仍保留在当前页，请使用本页「重试连接当前图书」后保存。','error');
 expect(formatter).not.toHaveBeenCalled();expect(page.screen.firstElementChild).toBe(manuscript);
});

it('a change of failure kind rewrites the existing notice in place, keeping its node, its retry and the status (#1504 item 12)', async () => {
 const leave=Promise.withResolvers<void>();let opens=0;
 const open=vi.fn(async()=>{if(++opens===1)throw new Error('offline');return {target:'held-elsewhere'};});
 const page=harness({leaveBookWorkbench:()=>leave.promise,openBookWorkbench:open});
 const manuscript=document.createElement('section');manuscript.dataset['bookId']='book-a';page.replaceScreen('editor',manuscript);
 const pending=page.run('renderGlobalAgent()');page.context['settleScreen']=async()=>false;
 await page.run('leaveThen(() => renderGlobalAgent())');leave.resolve();await pending;
 const notice=page.screen.querySelector('[data-book-reacquire]')!,again=notice.querySelector('button')!;
 expect(notice.querySelector('p')!.textContent).toBe(bookOwnershipFailureLine(new Error('offline')));
 page.setStatus.mockClear();
 await page.actions.get('重试连接当前图书')!();
 const held=bookOwnershipFailureLine(new BookHeldElsewhereError());
 expect(open).toHaveBeenCalledTimes(2);expect(page.screen.firstElementChild).toBe(manuscript);
 expect(page.screen.querySelectorAll('[data-book-reacquire]')).toHaveLength(1);expect(page.screen.querySelector('[data-book-reacquire]')).toBe(notice);
 expect(notice.querySelector('button')).toBe(again);expect(notice.querySelector('p')!.textContent).toBe(held);
 expect(page.setStatus).toHaveBeenCalledExactlyOnceWith(held,'error');
});

it('a superseded explicit open of another Book keeps the remaining page paused until its own recovery, which then resumes it (#1504 item 13)', async () => {
 const leave=Promise.withResolvers<void>(),answerB=Promise.withResolvers<object>();let elsewhere=true;
 const leaving=vi.fn().mockReturnValueOnce(leave.promise).mockResolvedValue({state:'library'});
 const open=vi.fn(async(input:{bookId:string;activation?:string})=>input.activation===undefined?answerB.promise
  :elsewhere?{target:'held-elsewhere'}:{target:'requesting-window',route:{kind:'book',bookId:input.bookId,bookTitle:'甲'}});
 const page=harness({leaveBookWorkbench:leaving,openBookWorkbench:open,getBookWorkbenchRoute:async()=>null,inspectBookTasks:async()=>({groups:[]})});
 const manuscript=document.createElement('section');manuscript.dataset['bookId']='book-a';page.replaceScreen('editor',manuscript);
 const pending=page.run('renderGlobalAgent()');page.context['settleScreen']=async()=>false;
 await page.run('leaveThen(() => renderGlobalAgent())');leave.resolve();await pending;
 // The task poll of the page on screen pauses on the failure until its Book is held again.
 const paused=await page.run('api.inspectBookTasks()').then(()=>null,(error:unknown)=>error as BookOwnershipFailure);
 expect(paused).toBeInstanceOf(BookOwnershipFailure);let resumed=false;void paused!.recovered.then(()=>{resumed=true;});
 // A failed retry keeps the same recovery the poll waits on.
 await page.actions.get('重试连接当前图书')!();expect(open).toHaveBeenCalledTimes(2);expect(resumed).toBe(false);
 // An explicit open of Book B is answered "this window" after a later click superseded its page.
 const opening=page.run("openBookSection({bookId:'book-b',title:'乙'},'overview')");await vi.waitFor(()=>expect(open).toHaveBeenCalledTimes(3));
 await page.run('leaveThen(() => renderGlobalAgent())');
 answerB.resolve({target:'requesting-window',route:{kind:'book',bookId:'book-b',bookTitle:'乙'}});await opening;
 expect(page.screen.firstElementChild).toBe(manuscript);expect(page.screen.querySelector('[data-book-reacquire]')).not.toBeNull();
 await Promise.resolve();expect(resumed).toBe(false);
 // The page's own recovery hands B back and re-acquires A; the paused poll resumes.
 elsewhere=false;await page.actions.get('重试连接当前图书')!();await Promise.resolve();
 expect(leaving).toHaveBeenCalledTimes(2);expect(open).toHaveBeenLastCalledWith({kind:'book',bookId:'book-a',activation:'non-activating'});
 expect(resumed).toBe(true);expect(page.screen.firstElementChild).toBe(manuscript);expect(page.screen.querySelector('[data-book-reacquire]')).toBeNull();
});

it('when the opened Book\'s page does arrive, a later recovery there never resumes the old Book\'s paused reader (#1504 item 13)', async () => {
 const leave=Promise.withResolvers<void>(),again=Promise.withResolvers<void>();let elsewhere=true;
 const leaving=vi.fn().mockReturnValueOnce(leave.promise).mockReturnValueOnce(again.promise).mockResolvedValue({state:'library'});
 const open=vi.fn(async(input:{bookId:string;activation?:string})=>input.activation===undefined?{target:'requesting-window',route:{kind:'book',bookId:input.bookId,bookTitle:'乙'}}
  :elsewhere?{target:'held-elsewhere'}:{target:'requesting-window',route:{kind:'book',bookId:input.bookId,bookTitle:'乙'}});
 const page=harness({leaveBookWorkbench:leaving,openBookWorkbench:open,inspectBookTasks:async()=>({groups:[]})});
 const manuscript=document.createElement('section');manuscript.dataset['bookId']='book-a';page.replaceScreen('editor',manuscript);
 let pending=page.run('renderGlobalAgent()');page.context['settleScreen']=async()=>false;
 await page.run('leaveThen(() => renderGlobalAgent())');leave.resolve();await pending;
 const paused=await page.run('api.inspectBookTasks()').then(()=>null,(error:unknown)=>error as BookOwnershipFailure);
 let resumed=false;void paused!.recovered.then(()=>{resumed=true;});
 // The explicit open of B is answered for this window and B's page arrives.
 await page.run("api.openBookWorkbench({kind:'book',bookId:'book-b'})");
 const shown=document.createElement('section');shown.dataset['bookId']='book-b';page.replaceScreen('book-overview',shown);
 // A superseded leave on B re-acquires B: B's recovery, not A's.
 elsewhere=false;pending=page.run('renderGlobalAgent()');
 await page.run('leaveThen(() => renderGlobalAgent())');again.resolve();await pending;await Promise.resolve();
 expect(open).toHaveBeenLastCalledWith({kind:'book',bookId:'book-b',activation:'non-activating'});
 expect(page.screen.firstElementChild).toBe(shown);expect(resumed).toBe(false);
});

// The real drawer, mounted as the shell mounts it: it marks the shell (document.body) as well as its own root.
type Drawer = ReturnType<typeof mountTaskDrawer>;
const inside = (host: HTMLElement): HTMLElement => { const control = document.createElement('button'); host.append(control); return control; };
it.each<readonly [string, (drawer: Drawer, root: HTMLElement) => { working: HTMLElement; kept: boolean }]>([
 ['the open Task Drawer', (drawer, root) => { drawer.openPanel('book-a', () => null); return { working: inside(root), kept: true }; }],
 ['the open command palette', () => { const sheet = document.createElement('dialog'); sheet.dataset['sheet'] = ''; miniDocument.body.append(sheet as unknown as MiniElement); sheet.show(); return { working: inside(sheet), kept: true }; }],
 ['a dialog', () => { const dialog = document.createElement('section'); dialog.setAttribute('role', 'dialog'); miniDocument.body.append(dialog as unknown as MiniElement); return { working: inside(dialog), kept: true }; }],
 ['no overlay (the closed drawer still marks the shell)', () => ({ working: inside(document.body), kept: false })],
])('a late 评估 answer keeps focus in %s only while it is open (#1504 item 5)', async (_name, overlay) => {
 vi.stubGlobal('window', { setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => undefined, getSelection: () => null, addEventListener: () => undefined, removeEventListener: () => undefined });
 try {
  const root = document.createElement('aside'); miniDocument.body.append(root as unknown as MiniElement);
  const never = new Proxy({}, { get: () => () => new Promise(() => undefined) });
  const drawer = mountTaskDrawer({ root, shell: document.body, api: never, setStatus: vi.fn(), errorMessage: (_error: unknown, fallback: string) => fallback,
   onOpen: vi.fn(), onRecorded: vi.fn(), settle: async () => true } as unknown as Parameters<typeof mountTaskDrawer>[0]);
  expect(document.body.dataset['taskDrawer']).toBeDefined();
  // 评估 opened at a named risk: the risk takes focus once the surface's late read has painted it.
  const loaded = Promise.withResolvers<void>(), risk = document.createElement('div');risk.dataset['riskId'] = 'risk-1';
  const page = harness();page.context['CSS'] = { escape: (value: string) => value };
  page.context['mountEvaluation'] = (options: { root: HTMLElement }) => ({ load: () => loaded.promise.then(() => { options.root.append(risk); }), refresh: vi.fn() });
  const { working, kept } = overlay(drawer, root);
  MiniElement.prototype.focus.call(working);
  await page.run("renderBookEvaluation('book-a','甲',{recordId:'record-1',riskId:'risk-1'})");
  loaded.resolve();await vi.waitFor(() => expect(page.screen.querySelector('[data-risk-id="risk-1"]')).toBe(risk));await new Promise((resolve) => setTimeout(resolve, 0));
  expect(miniDocument.activeElement).toBe(kept ? working : risk);
 } finally { vi.unstubAllGlobals(); }
});

it('five background Book reads after failed reconciliation send no retry and keep the existing notice', async () => {
 const leave=Promise.withResolvers<void>();const open=vi.fn(async()=>({target:'held-elsewhere'})),read=vi.fn();
 const page=harness({leaveBookWorkbench:()=>leave.promise,openBookWorkbench:open,inspectBookTasks:read});
 const manuscript=document.createElement('section');manuscript.dataset['bookId']='book-a';page.replaceScreen('editor',manuscript);
 const pending=page.run('renderGlobalAgent()');page.context['settleScreen']=async()=>false;
 await page.run('leaveThen(() => renderGlobalAgent())');leave.resolve();await pending;
 const notice=page.screen.querySelector('[data-book-reacquire]');page.setStatus.mockClear();
 for(let i=0;i<5;i+=1)await page.run('api.inspectBookTasks()').catch(()=>undefined);
 expect(open).toHaveBeenCalledOnce();expect(read).not.toHaveBeenCalled();
 expect(page.screen.querySelector('[data-book-reacquire]')).toBe(notice);expect(page.setStatus).not.toHaveBeenCalled();
});

it('one journal action makes one automatic attempt and a repeated failure retains the notice and keyboard focus', async () => {
 const leave=Promise.withResolvers<void>(),open=vi.fn(async()=>({target:'held-elsewhere'})),save=vi.fn();
 const page=harness({leaveBookWorkbench:()=>leave.promise,openBookWorkbench:open,flushJournalEdit:save});
 const manuscript=document.createElement('section');manuscript.dataset['bookId']='book-a';page.replaceScreen('editor',manuscript);
 const pending=page.run('renderGlobalAgent()');page.context['settleScreen']=async()=>false;
 await page.run('leaveThen(() => renderGlobalAgent())');leave.resolve();await pending;
 const notice=page.screen.querySelector('[data-book-reacquire]')!,button=notice.querySelector('button')!;
 MiniElement.prototype.focus.call(button);page.setStatus.mockClear();page.context['editAction']={};
 for(let i=0;i<5;i+=1)await page.run("sendEdit({clientEditId:'edit-1'},editAction)").catch(()=>undefined);
 expect(open).toHaveBeenCalledTimes(2);expect(save).not.toHaveBeenCalled();
 await page.actions.get('重试连接当前图书')!();
 expect(open).toHaveBeenCalledTimes(3);expect(page.screen.querySelector('[data-book-reacquire]')).toBe(notice);
 expect(notice.querySelector('button')).toBe(button);expect(miniDocument.activeElement).toBe(button);
 expect(button.disabled).toBe(false);expect(page.setStatus).not.toHaveBeenCalled();
});

it('a failed-state Book read-click reports the same editorial notice at the clicked surface without retrying', async () => {
 const leave=Promise.withResolvers<void>(),open=vi.fn(async()=>({target:'held-elsewhere'}));
 const page=harness({leaveBookWorkbench:()=>leave.promise,openBookWorkbench:open,getBookOverview:vi.fn()});
 const manuscript=document.createElement('section');manuscript.dataset['bookId']='book-a';page.replaceScreen('editor',manuscript);
 const pending=page.run('renderGlobalAgent()');page.context['settleScreen']=async()=>false;
 await page.run('leaveThen(() => renderGlobalAgent())');leave.resolve();await pending;
 const notice=page.screen.querySelector('[data-book-reacquire]')!.querySelector('p')!.textContent;
 page.context['rendererErrorMessage']=rendererErrorMessage;
 page.setStatus.mockClear();
 await page.run("jumpToManuscript('book-a',{manuscriptId:'manuscript',blockId:'block',markId:null})");
 expect(open).toHaveBeenCalledOnce();expect(page.setStatus).toHaveBeenLastCalledWith(notice,'error');
 expect(notice).toContain('重试连接当前图书');expect(notice).not.toContain('AI7_');
});

it('an explicit same-Book open bypasses failed reconciliation and focuses its existing window without replacing the editor', async () => {
 const bookId='book-a',target='existing-window';
 const leave=Promise.withResolvers<void>();const open=vi.fn(async(input:{activation?:string;bookId:string})=>input.activation
  ?{target:'held-elsewhere'}:{target,route:{kind:'book',bookId:input.bookId,bookTitle:'图书'}});
 const page=harness({leaveBookWorkbench:()=>leave.promise,openBookWorkbench:open,getBookWorkbenchRoute:async()=>null});
 const manuscript=document.createElement('section');manuscript.dataset['bookId']='book-a';page.replaceScreen('editor',manuscript);
 const destroy=vi.fn();page.context['manuscriptOnScreen']={manuscriptId:'manuscript',branchId:'branch',readingPlace:()=>null,destroy};
 const pending=page.run('renderGlobalAgent()');page.context['settleScreen']=async()=>false;
 await page.run('leaveThen(() => renderGlobalAgent())');leave.resolve();await pending;
 await page.run(`openBookSection({bookId:'${bookId}',title:'图书'},'overview')`);
 expect(open).toHaveBeenCalledTimes(2);expect(open).toHaveBeenLastCalledWith({kind:'book',bookId});
 expect(page.screen.firstElementChild).toBe(manuscript);expect(destroy).not.toHaveBeenCalled();
 expect(page.setStatus).toHaveBeenLastCalledWith(target==='existing-window'?'已切换到《图书》已有的图书工作台。':'已在新的图书工作台打开《图书》。','success');
});

it('opening another Book in this clean window clears the failed gate before its overview loads', async () => {
 const leave=Promise.withResolvers<void>(),overview=vi.fn(async()=>({book:{bookId:'book-b'},manuscriptAnchor:null}));
 const page=harness({leaveBookWorkbench:()=>leave.promise,getBookWorkbenchRoute:async()=>null,getBookOverview:overview,
  openBookWorkbench:async(input:{activation?:string})=>input.activation?{target:'held-elsewhere'}:{target:'requesting-window',route:{kind:'book',bookId:'book-b',bookTitle:'图书'}}});
 const manuscript=document.createElement('section');manuscript.dataset['bookId']='book-a';page.replaceScreen('editor',manuscript);
 const pending=page.run('renderGlobalAgent()');page.context['settleScreen']=async()=>false;
 await page.run('leaveThen(() => renderGlobalAgent())');leave.resolve();await pending;
 await page.run("openBookSection({bookId:'book-b',title:'图书'},'overview')");
 expect(overview).toHaveBeenCalledOnce();expect(page.screen.dataset['screen']).toBe('book-b');
 expect(page.screen.querySelector('[data-book-reacquire]')).toBeNull();
});

it('retries a failed manuscript capability read without opening an already re-acquired Book again', async () => {
 const leave=Promise.withResolvers<void>();let reads=0;
 const open=vi.fn(async()=>({target:'requesting-window'}));
 const page=harness({leaveBookWorkbench:()=>leave.promise,openBookWorkbench:open,
  getManuscriptWindow:async()=>{if(++reads===1)throw new Error('offline');return {bookId:'book-a'};},flushJournalEdit:async()=>undefined});
 const manuscript=document.createElement('section');manuscript.dataset['bookId']='book-a';page.replaceScreen('editor',manuscript);
 page.context['manuscriptOnScreen']={manuscriptId:'manuscript',branchId:'branch',readingPlace:()=>null,destroy:vi.fn()};
 const pending=page.run('renderGlobalAgent()');page.context['settleScreen']=async()=>false;
 await page.run('leaveThen(() => renderGlobalAgent())');leave.resolve();await pending;
 await page.run("sendEdit({clientEditId:'edit-1'},{})");
 expect(open).toHaveBeenCalledOnce();expect(reads).toBe(2);expect(page.screen.firstElementChild).toBe(manuscript);
});

it('does not let an older library page overwrite a newer filter result', async () => {
 const more=Promise.withResolvers<object>(),filtered=Promise.withResolvers<object>();
 const page=harness({listBooks:({after}:{after:string|null})=>after===null?filtered.promise:more.promise});
 runInContext(ts.transpileModule(libraryLanding,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,page.context);
 page.context['book']={bookId:'book-a',title:'原有图书',people:{authors:[],editors:[],related:[]},internalNumber:null,manuscriptStateLabel:'有稿件'};
 await page.run("renderLanding([],undefined,{items:[book],nextCursor:'next'})");
 const pending=page.actions.get('加载更多图书')!();
 const input=page.screen.querySelector<HTMLInputElement>('[id="book-filter-text"]')!;input.value='筛选图书';
 (input as unknown as MiniElement).dispatchEvent({type:'input'});
 (page.screen.querySelector('form') as unknown as MiniElement).dispatchEvent({type:'submit'});
 filtered.resolve({items:[{bookId:'book-b',title:'筛选图书',people:{authors:[],editors:[],related:[]},internalNumber:null,manuscriptStateLabel:'有稿件'}],nextCursor:null});
 await Promise.resolve();await Promise.resolve();
 more.resolve({items:[{bookId:'book-c',title:'旧的下一页',people:{authors:[],editors:[],related:[]},internalNumber:null,manuscriptStateLabel:'有稿件'}],nextCursor:null});await pending;
 expect(page.screen.textContent).toContain('筛选图书');expect(page.screen.textContent).not.toContain('旧的下一页');
});

it('keeps filtering in place without rereading first-use settings when cleared', async () => {
 const preference=Promise.withResolvers<object>(),readPreference=vi.fn(()=>preference.promise);
 const book={bookId:'book-a',title:'原有图书',people:{authors:[],editors:[],related:[]},internalNumber:null,manuscriptStateLabel:'有稿件'};
 const page=harness({getPreferences:readPreference,listBooks:async({filter}:{filter?:object})=>({items:[{...book,title:filter?'新的筛选结果':'旧的全部图书'}],nextCursor:null})});
 runInContext(ts.transpileModule(libraryLanding,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,page.context);
 page.context['book']=book;
 await page.run("renderLanding([],undefined,{items:[book],nextCursor:null},{field:'all',text:'原有'})");
 page.actions.get('显示全部图书')!(); await new Promise(resolve=>setImmediate(resolve));
 expect(readPreference).not.toHaveBeenCalled();
 const input=page.screen.querySelector<HTMLInputElement>('[id="book-filter-text"]')!;input.value='新的';
 (input as unknown as MiniElement).dispatchEvent({type:'input'});
 (page.screen.querySelector('form') as unknown as MiniElement).dispatchEvent({type:'submit'});
 await new Promise(resolve=>setImmediate(resolve));
 preference.resolve({values:{'onboarding.state':'skipped'}});await new Promise(resolve=>setImmediate(resolve));
 expect(page.screen.textContent).toContain('新的筛选结果');expect(page.screen.textContent).not.toContain('旧的全部图书');
});

it('reports a library-card error after its requested Book committed', async () => {
 const page=harness({openBookWorkbench:async()=>({target:'requesting-window',route:{kind:'book',bookId:'book-a',bookTitle:'图书'}}),getBookOverview:async()=>({book:{bookId:'book-a'},manuscriptAnchor:null})});
 runInContext(ts.transpileModule(libraryLanding,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,page.context);
 page.context['book']={bookId:'book-a',title:'原有图书',people:{authors:[],editors:[],related:[]},internalNumber:null,manuscriptStateLabel:'有稿件'};
 await page.run("renderLanding([],undefined,{items:[book],nextCursor:null})");
 page.context['renderBookOverview']=()=>{page.replaceScreen('book-overview');throw new Error('paint failed');};
 await page.actions.get('原有图书')!();
 expect(page.setStatus).toHaveBeenLastCalledWith('无法打开图书。','error');
});

it('reports a jump error after its editor committed instead of rejecting its own page identity', async () => {
 const page=harness({getBookOverview:async()=>({book:{bookId:'book-a',title:'图书'},manuscriptAnchor:{manuscriptId:'manuscript',branchId:'branch'}}),getManuscriptWindowAt:async()=>({bookId:'book-a'})});
 page.replaceScreen('book-review');
 page.context['renderEditorWindow']=()=>{page.replaceScreen('editor');throw new Error('paint failed');};
 const opened=await page.run("jumpToManuscript('book-a',{manuscriptId:'manuscript',blockId:'block',markId:null})");
 expect(opened).toBe(false);expect(page.setStatus).toHaveBeenLastCalledWith('无法打开对应稿件位置。','error');
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


function completionProbe(read?: () => Promise<TaskOverviewProjection>, change: Partial<GlobalAttentionItemProjection> = {}) {
 const item: GlobalAttentionItemProjection = { itemId:'analysis:completion',group:'recent',state:'analysis-completed',blocked:false,at:'2026-11-16T00:00:01Z',
  book:{bookId:'completion-book',title:'测试图书'},object:{kind:'analysis',mode:'first-baseline'},facts:{progress:null,categories:[],revisionOrdinal:null},
  nextStep:'view-run',target:{kind:'analysis',bookId:'completion-book',taskIntentId:'completion'},technical:[],...change };
 const projection: GlobalAttentionProjection = {groups:[{key:'recent',items:[item],total:1}],actionableCount:0,running:false,processing:{state:'local'}};
 const overview=composeTaskOverview(projection,2,()=>null), inspect=vi.fn(read ?? (async()=>overview));
 const page=harness({notify:async()=>undefined,inspectTaskOverview:inspect,inspectBaselineAnalysis:async()=>({bookId:'completion-book'})});
 const options=page.context['completionObserverOptions'] as Parameters<typeof createNotificationObserver>[0];
 const observe=()=>createNotificationObserver({...options,focused:()=>true,startedAt:0})(projection);
 return {...page,overview,inspect,observe,item};
}

it.each(['overview','panel'])('automatically opens a completion while watching the %s with the real shell loader (#1510)',async surface=>{
 const page=completionProbe();
 await page.run(surface==='overview' ? 'renderTaskOverview()' : "renderBookReview('completion-book','测试图书')");
 if(surface==='panel') await page.run("taskDrawer.view=()=>({kind:'panel',bookId:'completion-book'})");
 page.observe();await Promise.resolve();await Promise.resolve();
 expect(page.context['showQuietNotice']).toHaveBeenCalledOnce();expect(page.context['openOverviewResult']).toHaveBeenCalledOnce();
});

it.each(['review','manuscript','analysis','settings','sheet','plan','dialogue','composer','launch','other-book-panel','off'])(
 'keeps a completion quiet on %s with the real shell destination (#1510)',async surface=>{
 const page=completionProbe();
 await page.run('renderTaskOverview()');
 if(surface==='review') await page.run("renderBookReview('completion-book','测试图书')");
 if(surface==='analysis') await page.run("renderBookAnalysis('completion-book','测试图书',undefined,{tab:'chapters'})");
 if(surface==='manuscript') page.replaceScreen('editor');
 if(surface==='settings') await page.run('renderKeyboardSettings()');
 if(surface==='sheet'){const sheet=document.createElement('dialog');sheet.setAttribute('open','');miniDocument.body.append(sheet as unknown as MiniElement);}
 if(['plan','dialogue','composer','launch','other-book-panel'].includes(surface)) await page.run(`taskDrawer.view=()=>({kind:${JSON.stringify(surface==='other-book-panel'?'panel':surface)},bookId:'other-book'})`);
 if(surface==='off') await page.run("localStorage.getItem=()=> 'off'");
 page.observe();await Promise.resolve();await Promise.resolve();
 expect(page.context['showQuietNotice']).toHaveBeenCalledOnce();expect(page.context['openOverviewResult']).not.toHaveBeenCalled();expect(page.inspect).not.toHaveBeenCalled();
});

it('does not open a completion after leaving and returning through the real loaders (#1510)',async()=>{
 const answer=Promise.withResolvers<TaskOverviewProjection>(),page=completionProbe(()=>answer.promise);
 await page.run('renderTaskOverview()');page.observe();expect(page.inspect).toHaveBeenCalledOnce();
 await page.run("renderBookReview('completion-book','测试图书')");await page.run('renderTaskOverview()');
 answer.resolve(page.overview);await Promise.resolve();await Promise.resolve();
 expect(page.context['openOverviewResult']).not.toHaveBeenCalled();expect(page.context['showQuietNotice']).toHaveBeenCalledOnce();
});

it.each(['sheet','off','plan'])('keeps a delayed completion quiet if %s changes during its read (#1510)',async change=>{
 const answer=Promise.withResolvers<TaskOverviewProjection>(),page=completionProbe(()=>answer.promise);
 await page.run('renderTaskOverview()');page.observe();expect(page.inspect).toHaveBeenCalledOnce();
 if(change==='sheet'){const sheet=document.createElement('dialog');sheet.setAttribute('open','');miniDocument.body.append(sheet as unknown as MiniElement);}
 if(change==='off') await page.run("localStorage.getItem=()=> 'off'");
 if(change==='plan') await page.run("taskDrawer.view=()=>({kind:'plan',bookId:'completion-book',task:{kind:'baseline-analysis',ref:'another-task'}})");
 answer.resolve(page.overview);await Promise.resolve();await Promise.resolve();
 expect(page.context['openOverviewResult']).not.toHaveBeenCalled();
});

it.each(['plan','run'])('opens a completion for the matching task in its %s drawer (#1510 own task)',async()=>{
 const page=completionProbe();await page.run("renderBookAnalysis('completion-book','测试图书',undefined,{tab:'chapters'})");
 await page.run("taskDrawer.view=()=>({kind:'plan',bookId:'completion-book',task:{kind:'baseline-analysis',ref:'completion'}})");
 page.observe();await Promise.resolve();await Promise.resolve();
 expect(page.context['openOverviewResult']).toHaveBeenCalledOnce();
});

const completedReview: Partial<GlobalAttentionItemProjection> = {itemId:'review:review-completion',state:'review-completed',object:{kind:'review',ordinal:1},
 target:{kind:'review',bookId:'completion-book',reviewRunId:'review-completion'}};
it.each([{shown:true,view:'plan'},{shown:false,view:'plan'},{shown:true,view:'panel'},{shown:false,view:'panel'}])('review result already shown=$shown controls its $view completion (#1510 own result)',async ({shown,view})=>{
 const page=completionProbe(undefined,completedReview);await page.run("renderBookReview('completion-book','测试图书')");
 const run=document.createElement('section');run.className='review-run';run.dataset['reviewRunId']=shown?'review-completion':'other-review';page.screen.firstElementChild!.append(run);
 await page.run(view==='panel' ? "taskDrawer.view=()=>({kind:'panel',bookId:'completion-book'})" : "taskDrawer.view=()=>({kind:'plan',bookId:'completion-book',task:{kind:'review-run',ref:'review-completion'}})");
 page.observe();await Promise.resolve();await Promise.resolve();
 expect(page.context['showQuietNotice']).toHaveBeenCalledOnce();
 expect(page.context['openOverviewResult']).toHaveBeenCalledTimes(shown?0:1);
});

it('opens the matching writing task drawer (#1510 own task)',async()=>{
 const page=completionProbe(undefined,{object:{kind:'task',taskKind:'writing'},target:{kind:'task-plan',bookId:'completion-book',taskKind:'writing',ref:'writing-task'}});
 page.replaceScreen('editor');await page.run("taskDrawer.view=()=>({kind:'plan',bookId:'completion-book',task:{kind:'writing',ref:'writing-task'}})");
 page.observe();await Promise.resolve();await Promise.resolve();expect(page.context['openOverviewResult']).toHaveBeenCalledOnce();
});

it('keeps another task in the same Book quiet (#1510 own task)',async()=>{
 const page=completionProbe();page.replaceScreen('editor');
 await page.run("taskDrawer.view=()=>({kind:'plan',bookId:'completion-book',task:{kind:'baseline-analysis',ref:'different-task'}})");
 page.observe();await Promise.resolve();await Promise.resolve();
 expect(page.context['openOverviewResult']).not.toHaveBeenCalled();expect(page.inspect).not.toHaveBeenCalled();
});

it('an error stands through a repaint of the same destination and ends when another destination is rendered (#1519)', () => {
 const page=harness();
 const bar=miniDocument.createElement('div');miniDocument.body.append(bar);
 const surface=createStatusSurface(bar as unknown as HTMLElement);page.context['statusSurface']=surface;
 const book=()=>{const node=document.createElement('section');node.dataset['bookId']='book-a';return node;};
 page.replaceScreen('book-review',book());
 surface('无法应用修改建议。','error');
 page.replaceScreen('book-review',book());
 expect(bar.hidden).toBe(false);expect(bar.textContent).toContain('无法应用修改建议。');
 page.replaceScreen('book-findings',book());
 expect(bar.hidden).toBe(true);
});
