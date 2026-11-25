import type { mountWritingTask } from '../../src/renderer/writing-task.js';
import { setAutoApplyEditorRevisions, getAutoApplyEditorRevisions } from '../../src/renderer/editor-input-mode.js';
import { DEFAULT_QUICK_ACTIONS } from '../../src/shared/preferences.js';
import { setTechnicalLayerVisible } from '../../src/renderer/technical-layer.js';
import { expectNoTechnicalText } from '../support/technical-layer-scan.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountManuscriptScreen, type ManuscriptScreen } from '../../src/renderer/manuscript-screen.js';
import { NavigationGeneration, reconcileBookWorkbenchApi } from '../../src/renderer/navigation-generation.js';
import type { mountBoundedEditor } from '../../src/renderer/editor.js';
import { readReturnPlace, preserveReturnPlace } from '../../src/renderer/reading-return.js';
import { createStatusSurface, showTransientNotice } from '../../src/renderer/notifications.js';
import { readFileSync } from 'node:fs';
import { mountTaskDrawer, type MountTaskDrawerOptions } from '../../src/renderer/task-drawer.js';
import { BASELINE_ANALYSIS_TASK_GOAL } from '../../src/shared/protocol.js';
import { ICON_IDS } from '../../src/renderer/components/icon-sprite.js';
import { SHELL_AGENT_WORKSPACE_ROW, SHELL_BOOK_GROUPS, SHELL_DESTINATIONS, SHELL_MORE_BOOKS_ICON, SHELL_SETTINGS } from '../../src/renderer/shell-labels.js';
import { installMiniDom, miniDocument, MiniElement } from '../support/mini-dom.js';
import type { ManuscriptRailProjection, ManuscriptWindowProjection, RendererApi } from '../../src/shared/protocol.js';

const { watchReturnArrival } = await import(new URL('../../e2e/return-arrival.mjs', import.meta.url).href) as {
  watchReturnArrival(chip: HTMLElement): { arrived(): boolean; disconnect(): void };
};

// The Manuscript screen's own lifecycle (Issue #1127, revision 3), on its actual mount with each child owner and the service
// as a boundary double: a mount that throws after the shell attached it can still be read, settled and destroyed, once, and
// a journal write still in flight when its screen leaves clears the window's close risk without speaking over the next screen.

type ScreenOptions = Parameters<typeof mountManuscriptScreen>[0];
type EditorOptions = Parameters<typeof mountBoundedEditor>[0];
type EditorState = Parameters<EditorOptions['onStateChange']>[0];

const children = vi.hoisted(() => ({
  failAt: null as 'modes' | 'editor' | null,
  realParagraphAnalysis: false,
  realReadingReturn: false,
  destroyed: [] as string[],
  editors: [] as unknown[],
  /** Where the editor reads once the caret has scrolled out of sight (Issue #1703); the caret otherwise. */
  reading: null as { blockId: string; grapheme: number } | null,
  editorSurfaces: [] as Array<{ selectRange: ReturnType<typeof vi.fn>; focus: ReturnType<typeof vi.fn>; setInputMode: ReturnType<typeof vi.fn>; selectedRange: ReturnType<typeof vi.fn>; flush: ReturnType<typeof vi.fn> }>,
  marks: [] as Array<{ recordAndApplyEditorRevision: ReturnType<typeof vi.fn>; bookPendingChanged: ReturnType<typeof vi.fn>; refreshComments: ReturnType<typeof vi.fn> }>,
  protections: [] as Array<{ update: ReturnType<typeof vi.fn> }>,
  writingStates: [] as Array<(state: { underWay: boolean; drafted: number }) => void>,
  rails: [] as Array<{ onRead?: (rail: ManuscriptRailProjection) => void }>,
}));

vi.mock('../../src/renderer/editor-modes.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/renderer/editor-modes.js')>(),
  mountEditorModes: () => {
    if (children.failAt === 'modes') throw new Error('modes mount failed');
    return { protectionHost: document.createElement('div'), destroy: () => children.destroyed.push('modes') };
  },
}));
vi.mock('../../src/renderer/editor-protection.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/renderer/editor-protection.js')>(),
  mountProtectionSurface: () => {
    const surface = { update: vi.fn(), blockAction: vi.fn(), openOptions: vi.fn(), destroy: () => children.destroyed.push('protection') };
    children.protections.push(surface);
    return surface;
  },
}));
vi.mock('../../src/renderer/layout.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/renderer/layout.js')>(),
  mountRegionSeparator: () => ({ element: document.createElement('div'), destroy: () => children.destroyed.push('separator') }),
}));
vi.mock('../../src/renderer/save-menu.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/renderer/save-menu.js')>(),
  createSaveMenu: () => ({ element: document.createElement('details'), update: vi.fn(), destroy: () => children.destroyed.push('save-menu') }),
}));
vi.mock('../../src/renderer/paragraph-analysis.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/renderer/paragraph-analysis.js')>();
  return {
    ...original,
    mountParagraphAnalysis: (options: Parameters<typeof original.mountParagraphAnalysis>[0]) => children.realParagraphAnalysis ? original.mountParagraphAnalysis(options)
      : { refresh: vi.fn(), close: vi.fn(), toggle: vi.fn(), destroy: () => children.destroyed.push('paragraph-analysis') },
  };
});
vi.mock('../../src/renderer/position-rail.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/renderer/position-rail.js')>(),
  mountPositionRail: (options: { onRead?: (rail: ManuscriptRailProjection) => void }) => {
    children.rails.push(options);
    return { setPosition: vi.fn(), refresh: vi.fn(), destroy: () => children.destroyed.push('rail') };
  },
}));
vi.mock('../../src/renderer/editorial-marks.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/renderer/editorial-marks.js')>(),
  mountEditorialMarks: () => {
    const surface = {
      selectionSpan: vi.fn(), composeProcedures: vi.fn(), openMark: vi.fn(async () => undefined), holdsFloating: () => false,
      ownsScroll: () => false, refreshComments: vi.fn(), reanchor: vi.fn(), destroy: () => children.destroyed.push('marks'),
      quickRevise: vi.fn(() => false), revealRevision: vi.fn(async () => undefined), recordAndApplyEditorRevision: vi.fn(async () => 'mark-applied'),
      stepPending: vi.fn(async () => undefined), bookPendingChanged: vi.fn(),
    };
    children.marks.push(surface);
    return surface;
  },
}));
vi.mock('../../src/renderer/writing-task.js', () => ({
  mountWritingTask: (options: Parameters<typeof mountWritingTask>[0]) => {
    children.writingStates.push(options.onState!);
    return { refresh: vi.fn(), open: vi.fn(), destroy: vi.fn() };
  },
}));

vi.mock('../../src/renderer/reading-return.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/renderer/reading-return.js')>();
  return { ...original,
    readReturnPlace: vi.fn((...args: Parameters<typeof original.readReturnPlace>) => children.realReadingReturn ? original.readReturnPlace(...args) : Promise.resolve(null)),
    preserveReturnPlace: (place: Parameters<typeof original.preserveReturnPlace>[0]) => children.realReadingReturn ? original.preserveReturnPlace(place) : Promise.resolve(place),
    consumeReturnPlace: (place: Parameters<typeof original.consumeReturnPlace>[0]) => children.realReadingReturn ? original.consumeReturnPlace(place) : Promise.resolve(null),
  };
});
vi.mock('../../src/renderer/editor.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/renderer/editor.js')>(),
  mountBoundedEditor: (options: EditorOptions) => {
    if (children.failAt === 'editor') throw new Error('editor mount failed');
    const point = { blockId: options.initialWindow.blocks[0]!.blockId, grapheme: 0 };
    let currentWindow = options.initialWindow;
    children.editors.push(options);
    const surface = {
      focus: vi.fn(), flush: vi.fn(async () => undefined), interrupt: vi.fn(), setOperationLocked: vi.fn(), setMarks: vi.fn(),
      captureContinuity: () => ({ anchor: point, head: point, direction: 'forward', scrollAnchor: { blockId: point.blockId, offset: 0 }, focused: true }),
      readingPoint: () => children.reading ?? point,
      captureNavigationContinuity: () => ({ anchor: point, head: point, direction: 'forward', scrollAnchor: { blockId: point.blockId, offset: 0 }, focused: true }),
      currentWindow: () => currentWindow,
      loadWindow: vi.fn((next: ManuscriptWindowProjection) => { currentWindow = next; return true; }),
      loadNavigationWindow: vi.fn((next: ManuscriptWindowProjection) => { currentWindow = next; return true; }),
      selectRange: vi.fn((blockId: string) => currentWindow.blocks.some((block) => block.blockId === blockId)),
      highlightJump: vi.fn(), highlightAppliedRange: vi.fn(),
      inputModeValue: options.initialInputMode ?? 'reading-revision',
      inputMode() { return this.inputModeValue; },
      setInputMode: vi.fn(function (this: { inputModeValue: string }, mode: string) { this.inputModeValue = mode; }),
      selectedRange: vi.fn(() => ({ kind: 'none' })),
      currentBlockStyle: () => ({ kind: 'paragraph', level: null }),
      setBlockStyle: vi.fn(),
      isComposing: () => false,
      isOwnScroll: () => false,
      protection: () => null,
      destroy: () => children.destroyed.push('editor'),
    };
    children.editorSurfaces.push(surface);
    return surface;
  },
}));

const windowOf = (bookId: string): ManuscriptWindowProjection => ({
  bookId, manuscriptId: `${bookId}-manuscript`, branchId: 'branch-main', revisionId: 'rev-2', revisionLabel: 'r2',
  journalSequence: 4, workingDigest: 'a'.repeat(64), deliverable: 'manuscript', recoveredStateReview: null,
  position: { label: '第 3 段', proportion: 0.25, structureLabel: '第一章', totalCharacters: 12_345 },
  previousCursor: null, nextCursor: null, marks: [], marksTruncated: false,
  blocks: [{ blockId: 'blk_3', kind: 'paragraph', text: '合成段落。', position: 3, digest: 'b'.repeat(64) }],
}) as unknown as ManuscriptWindowProjection;

const state = (changes: Partial<EditorState>): EditorState => ({
  dirty: false, interrupted: false, retryRequired: false, saving: false, journalSequence: 4, workingDigest: 'a'.repeat(64),
  composing: false, operationLocked: false, protection: null, ...changes,
});

/** The service: what the screen awaits on mounting answers, every other read stays pending as one still in flight would. */
const api = new Proxy({ platform: 'win32', recordManuscriptEntryPosition: async () => undefined } as Record<string | symbol, unknown>, {
  get: (known, key) => key in known ? known[key] : () => new Promise<never>(() => undefined),
}) as unknown as RendererApi;

/**
 * The shell around one screen: its shared persistence status and close risk, and `replaceScreen` as it treats the
 * Manuscript screen on display — read where it was, destroy it, then show the next content.
 */
function shell(rendererApi = api) {
  const persistenceStatus = document.createElement('p');
  persistenceStatus.setAttribute('role', 'status');
  const contextView = document.createElement('div');
  const screen = document.createElement('main');
  document.body.append(persistenceStatus, contextView, screen);
  let showing: ManuscriptScreen | null = null;
  let closeRisk = false;
  const setStatus = (message: string): void => { persistenceStatus.textContent = message; };
  const replace = (content: HTMLElement): void => {
    showing?.readingPlace();
    showing?.destroy();
    showing = null;
    screen.replaceChildren(content);
  };
  const open = (initialWindow: ManuscriptWindowProjection, extra: Partial<ScreenOptions> = {}): void => mountManuscriptScreen({
    api: rendererApi, initialWindow, bookTitle: '合成书', persistenceStatus, contextView,
    viewPreferences: {} as ScreenOptions['viewPreferences'],
    preferences: { current: { 'analysis.lastViewedRevision': {} }, viewAnalysis: vi.fn() } as unknown as ScreenOptions['preferences'],
    commandDispatcher: { register: () => () => children.destroyed.push('commands') } as unknown as ScreenOptions['commandDispatcher'],
    taskDrawer: { isOpen: () => false, setColumnVisible: vi.fn(), close: vi.fn(), openPanel: vi.fn(), openDialogue: vi.fn(), openComposer: vi.fn() } as unknown as ScreenOptions['taskDrawer'],
    interrupted: () => false,
    attach: (content, surface) => { replace(content); showing = surface; },
    setContextActions: (...nodes) => contextView.replaceChildren(...nodes), setStatus, setCloseRisk: (risk) => { closeRisk = risk; },
    errorMessage: (_error, fallback) => fallback, recentlyActivatedControl: () => null, awaitServiceJob: async (job) => job,
    composerRangeOf: vi.fn(), selectionTaskOffer: vi.fn(), selectionProcedureOffer: vi.fn(), prepareSelectionTask: vi.fn(),
    renderEditorWindow: vi.fn(), renderBookAnalysis: vi.fn(),
    renderBookReview: vi.fn(), renderBookDeliverables: vi.fn(),
    renderProposalConflict: vi.fn(), renderProposalWorkspace: vi.fn(), returnToRecoveryComparison: vi.fn(),
    openPrimaryManuscript: vi.fn(async () => undefined), openProductionDocument: vi.fn(async () => undefined), openLaunch: vi.fn(), openWritingPlan: vi.fn(),
    ...extra,
  });
  return {
    persistenceStatus, screen, contextView, open,
    /** Another screen replaces this one without its leave guard (a recovery return, an owned workbench route) and says so. */
    leave: (status: string): void => { replace(document.createElement('section') as unknown as HTMLElement); setStatus(status); },
    get showing(): ManuscriptScreen | null { return showing; },
    get closeRisk(): boolean { return closeRisk; },
  };
}

let restore: () => void;
beforeEach(() => {
  restore = installMiniDom();
  vi.useFakeTimers();
  vi.stubGlobal('window', { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout });
  // The screen listens for the document's selection and passes its root to the protection surface.
  vi.stubGlobal('document', Object.assign(Object.create(miniDocument) as typeof miniDocument, {
    documentElement: new MiniElement('html'), getSelection: () => null, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    createTextNode: (text: string) => { const node = new MiniElement('#text'); node.textContent = text; return node; },
  }));
  children.failAt = null;
  children.realParagraphAnalysis = false;
  children.realReadingReturn = false;
  children.destroyed.length = 0;
  children.editors.length = 0;
  children.editorSurfaces.length = 0;
  children.reading = null;
  children.protections.length = 0;
  children.rails.length = 0;
  children.marks.length = 0;
  children.writingStates.length = 0;
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); restore(); });

it('pauses the actual manuscript task poll on ownership failure and resumes it after an explicit recovery', async () => {
  const owner=new NavigationGeneration();owner.commit('editor','book-one');let heldElsewhere=true;
  const open=vi.fn(async()=>({target:heldElsewhere?'held-elsewhere':'requesting-window',route:{kind:'book',bookId:'book-one'}}));
  const tasks=vi.fn(async()=>({running:true,groups:[]}));let retry:()=>Promise<void>=async()=>undefined;
  const boundary=reconcileBookWorkbenchApi({...api,leaveBookWorkbench:async()=>({state:'library'}),openBookWorkbench:open,inspectBookTasks:tasks} as unknown as RendererApi,
    {bookOnScreen:()=>owner.bookId,left:vi.fn(),failed:(_error,again)=>{retry=again;}},owner);
  const leaving=boundary.leaveBookWorkbench();owner.begin();await leaving.catch(()=>undefined);
  const badgeReads=vi.fn(()=>boundary.inspectBookTasks());
  const rendererApi=new Proxy(boundary,{get:(target,key)=>key==='inspectBookTasks'?badgeReads:Reflect.get(target,key)??Reflect.get(api,key)});
  const app=shell(rendererApi);app.open(windowOf('book-one'));
  await vi.advanceTimersByTimeAsync(20_000);
  expect(open).toHaveBeenCalledOnce();expect(tasks).not.toHaveBeenCalled();expect(badgeReads).toHaveBeenCalledOnce();
  heldElsewhere=false;await retry();await vi.advanceTimersByTimeAsync(0);
  expect(open).toHaveBeenCalledTimes(2);expect(tasks).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(2_000);expect(tasks).toHaveBeenCalledTimes(2);
  app.showing?.destroy();
});

async function searchArrivalWithPendingWrite(jump = true) {
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => setTimeout(callback, 16));
  const initial = { ...windowOf('book-one'), nextCursor: 'next' };
  const matchWindow = { ...initial, blocks: [{ ...initial.blocks[0]!, blockId: 'match', text: '星河校准' }], nextCursor: 'next' };
  const laterWindow = { ...initial, blocks: [{ ...initial.blocks[0]!, blockId: 'later' }] };
  let releaseWrite = (): void => {};
  let holdWrite = false;
  const record = vi.fn(({ blockId }: { blockId: string }) => holdWrite && blockId === 'match'
    ? new Promise<void>((resolve) => { releaseWrite = resolve; }) : Promise.resolve());
  const load = vi.fn(async ({ target }: { target: { kind: string } }) => target.kind === 'block' ? matchWindow : target.kind === 'window-start' ? initial : laterWindow);
  const methods = {
    recordManuscriptEntryPosition: record, getManuscriptWindowAt: load,
    startSearch: async () => ({ jobId: 'search-job', state: 'completed', kind: 'search', result: { searchId: 'search' } }),
    getSearchResults: async () => ({ ...initial, searchId: 'search', query: '星河校准', scopeLabel: '全稿', totalMatches: 1,
      previousCursor: null, nextCursor: null,
      results: [{ matchId: 'match-id', blockId: 'match', fromGrapheme: 0, toGrapheme: 4, headingLabel: '第一章', context: '星河校准' }] }),
  };
  const rendererApi = new Proxy(api, { get: (target, key) => key in methods ? methods[key as keyof typeof methods] : Reflect.get(target, key) });
  const app = shell(rendererApi);
  app.open(initial);
  const pane = app.screen.querySelector('.editor-window')! as unknown as MiniElement;
  Object.assign(pane, { clientWidth: 800, clientHeight: 500, scrollHeight: 1500, scrollTop: 500 });
  pane.dispatchEvent({ type: 'scroll' });
  await vi.advanceTimersByTimeAsync(40);
  app.screen.querySelector<HTMLInputElement>('[id="manuscript-search"]')!.value = '星河校准';
  [...app.screen.querySelectorAll('button')].find((button) => button.textContent === '查找全稿')!.click();
  await vi.advanceTimersByTimeAsync(0);
  holdWrite = true;
  expect(app.screen.querySelector('.search-result button'), app.persistenceStatus.textContent).not.toBeNull();
  if (jump) app.screen.querySelector<HTMLButtonElement>('.search-result button')!.click();
  return { app, pane, load, record, initial, releaseWrite: () => releaseWrite() };
}

describe('the Manuscript screen lifecycle', () => {
  it.each(['click', 'keydown'])('honors an immediate note return through %s while arrival frames settle', async (type) => {
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => setTimeout(callback, 16));
    const initial = windowOf('book-one');
    const note = { ...initial, blocks: [{ ...initial.blocks[0]!, blockId: 'note' }], focusBlockId: 'note' };
    const load = vi.fn(async ({ target }: { target: { blockId: string } }) => target.blockId === 'note' ? note : initial);
    const app = shell(new Proxy(api, { get: (target, key) => key === 'getManuscriptWindowAt' ? load : Reflect.get(target, key) }));
    app.open(initial);
    const host = app.screen.querySelector('.editor-window')!.children[0]!;
    const forward = document.createElement('sup'); forward.dataset['noteReference'] = 'note';
    const back = document.createElement('span'); back.dataset['noteReference'] = initial.blocks[0]!.blockId;
    host.append(forward, back);
    forward.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(1);
    // The destination is already visible, but the first navigation still owns its two arrival frames.
    (back as unknown as MiniElement).dispatchEvent({ type, key: 'Enter', bubbles: true });
    await vi.advanceTimersByTimeAsync(80);
    expect(load).toHaveBeenCalledTimes(2);
    expect(load.mock.calls[1]?.[0].target).toEqual({ kind: 'block', blockId: initial.blocks[0]!.blockId });
    app.showing?.destroy();
  });

  it('returns through a reading chip without taking focus from an active input', async () => {
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => setTimeout(callback, 16));
    const initial = windowOf('book-one');
    vi.mocked(readReturnPlace).mockResolvedValueOnce({ manuscriptId: initial.manuscriptId, branchId: initial.branchId,
      blockId: 'blk_3', place: '第一章' });
    const app = shell(new Proxy(api, { get: (target, key) => key === 'getManuscriptWindowAt' ? async () => initial : Reflect.get(target, key) }));
    app.open(initial);
    await vi.advanceTimersByTimeAsync(0);
    const input = document.createElement('input'); document.body.append(input);
    const editor = children.editorSurfaces.at(-1)!; editor.focus.mockClear();
    app.contextView.querySelector<HTMLButtonElement>('[data-return-chip]')!.click();
    input.focus();
    await vi.advanceTimersByTimeAsync(80);
    expect(app.contextView.querySelector('[data-return-chip]')).toBeNull();
    expect(document.activeElement).toBe(input);
    expect(editor.selectRange).not.toHaveBeenCalled();
    expect(editor.focus).not.toHaveBeenCalled();
    app.showing?.destroy();
  });

  it.each([true, false])('keeps arrival tied to this return when another notice replaces it (arrival emitted: %s)', async emitArrival => {
    children.realReadingReturn = true;
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => setTimeout(callback, 16));
    const records = new Map<string, unknown>();
    const db = { close() {}, onversionchange: () => {}, transaction() {
      const transaction = { oncomplete: () => {}, onabort: () => {}, onerror: () => {}, abort() { transaction.onabort(); }, objectStore: () => ({
        get(key: string) { const request = { result: undefined as unknown, onsuccess: () => {} };
          queueMicrotask(() => { request.result = records.get(key); request.onsuccess(); queueMicrotask(() => transaction.oncomplete()); }); return request; },
        put(value: unknown, key: string) { records.set(key, value); }, delete(key: string) { records.delete(key); },
      }) }; return transaction;
    } };
    vi.stubGlobal('indexedDB', { open() { const request = { result: db, onsuccess: () => {} }; queueMicrotask(() => request.onsuccess()); return request; } });
    const initial = windowOf('book-one');
    const place = { manuscriptId: initial.manuscriptId, branchId: initial.branchId, blockId: 'blk_3', place: '第一章' };
    await preserveReturnPlace(place);
    const app = shell(new Proxy(api, { get: (target, key) => key === 'getManuscriptWindowAt' ? async () => initial : Reflect.get(target, key) }));
    const status = createStatusSurface(app.persistenceStatus);
    let emitted = false;
    app.open(initial, { setStatus: (message, tone) => {
      if (message === '已回到第一章。') {
        if (emitArrival) { status(message, tone); emitted = true; }
        showTransientNotice('合成任务已完成');
      } else status(message, tone);
    } });
    let stopObservation = () => {};
    try {
      await vi.advanceTimersByTimeAsync(0);
      const view = document.createElement('section'); view.dataset['screen'] = 'editor';
      const prose = document.createElement('div'); prose.className = 'ProseMirror';
      const block = document.createElement('p'); block.dataset['blockId'] = place.blockId; prose.append(block); view.append(prose); app.screen.append(view);
      const back = app.contextView.querySelector<HTMLButtonElement>('[data-return-chip]')!;
      expect(document.querySelector('.return-chip-host [data-return-chip]')).toBe(back);
      // Request-boundary double for native MutationObserver delivery: removed addedNodes retain their text until the callback.
      let changes: Array<{ target: MiniElement; addedNodes: MiniElement[] }> = [];
      let deliver: (records: typeof changes) => void = () => {};
      let watching = false;
      vi.stubGlobal('MutationObserver', class {
        constructor(callback: typeof deliver) { deliver = callback; }
        observe() { watching = true; }
        takeRecords() { const records = changes; changes = []; return records; }
        disconnect() { watching = false; changes = []; }
      });
      const replace = MiniElement.prototype.replaceChildren;
      const writes = vi.spyOn(MiniElement.prototype, 'replaceChildren').mockImplementation(function (this: MiniElement, ...nodes) {
        replace.apply(this, nodes);
        if (watching && this.hasAttribute('data-toast')) {
          changes.push({ target: this, addedNodes: [...this.children] });
          queueMicrotask(() => { const records = changes; changes = []; if (watching && records.length) deliver(records); });
        }
      });
      const arrival = watchReturnArrival(back);
      stopObservation = () => { arrival.disconnect(); writes.mockRestore(); };
      vi.stubGlobal('__j16ReturnArrival', arrival);
      // An identical old toast before the click must not satisfy this action's negative case.
      status('已回到第一章。', 'success');
      back.click();
      await vi.advanceTimersByTimeAsync(80);
      expect(await readReturnPlace(place.manuscriptId, place.branchId)).toBeNull();
      expect(app.contextView.querySelector('[data-return-chip]')).toBeNull();
      expect(document.querySelector('[data-screen="editor"] .ProseMirror [data-block-id="blk_3"]')).not.toBeNull();
      expect(emitted).toBe(emitArrival);
      expect(arrival.arrived()).toBe(emitArrival);
      expect(document.querySelector('[data-toast]')?.textContent).toBe('合成任务已完成');
      const source = readFileSync(new URL('../../e2e/run-j16.mjs', import.meta.url), 'utf8');
      const template = /await waitFor\(renderer, `([^`]+)`, 'chip-returned'/u.exec(source)?.[1];
      expect(template).toBeDefined();
      const expression = Function('CHIP', 'blockInView', 'chip', 'return `'+template+'`;')(
        'document.querySelector(".return-chip-host [data-return-chip]")',
        (id: string) => `document.querySelector('[data-screen="editor"] .ProseMirror [data-block-id="${id}"]') !== null`, { blockId: place.blockId });
      const completed = () => Function('return ('+expression+')')();
      expect(completed()).toBe(emitArrival);
      if (emitArrival) {
        block.remove(); expect(completed()).toBe(false); prose.append(block);
        const host = app.contextView.querySelector<HTMLElement>('.return-chip-host')!;
        host.append(back); expect(completed()).toBe(false); back.remove();
      }
    } finally { stopObservation(); app.showing?.destroy(); db.onversionchange(); }
  });
  it('keeps the full long outline heading available to assistive tools and its title', async () => {
    const style = Object.getOwnPropertyDescriptor(MiniElement.prototype, 'style')!;
    Object.defineProperty(MiniElement.prototype, 'style', { configurable: true, value: { setProperty: vi.fn() } });
    try {
      const heading = '长'.repeat(200);
      const rendererApi = new Proxy(api, { get: (target, key) => key === 'getOutline'
        ? async () => ({ entries: [{ blockId: 'blk_3', kind: 'heading', level: 2, text: heading, displayTextTruncated: false }], previousCursor: null, nextCursor: null })
        : Reflect.get(target, key) });
      const app = shell(rendererApi);
      app.open(windowOf('book-one'));
      app.screen.querySelector<HTMLButtonElement>('[data-edge-entry="navigation"]')!.click();
      await vi.advanceTimersByTimeAsync(0);
      const headingButton = app.screen.querySelector('.outline-list button')!;
      expect(headingButton.getAttribute('title')).toBe(heading);
      expect(headingButton.getAttribute('aria-label')).toBe(heading);
      app.showing?.destroy();
    } finally { Object.defineProperty(MiniElement.prototype, 'style', style); }
  });

  it('keeps a long manuscript heading compact while retaining its full position detail', () => {
    const heading = '长标题'.repeat(100);
    const full = `${heading} · 全稿 25.000%`;
    const app = shell();
    const initial = windowOf('book-one');
    app.open({ ...initial, position: { ...initial.position, label: full, structureLabel: heading, proportion: 0.25 } });
    const position = app.screen.querySelector('.editor-position')!;
    expect(position.textContent).toBe('长标题长标题长标题长标题长标题长…');
    expect(position.getAttribute('title')).toBe(heading);
    app.showing?.destroy();
  });

  it('selects a search match in its arrival window before a slow entry write lets the viewport move on', async () => {
    const { app, pane, load, record, releaseWrite } = await searchArrivalWithPendingWrite();
    await vi.advanceTimersByTimeAsync(40);
    expect(record).toHaveBeenCalledTimes(2);
    // A scroll after arrival is admitted while its position write is still in flight (#474).
    Object.assign(pane, { scrollTop: 1000 });
    pane.dispatchEvent({ type: 'scroll' });
    await vi.advanceTimersByTimeAsync(40);
    expect(load).toHaveBeenCalledTimes(2);
    releaseWrite();
    await vi.advanceTimersByTimeAsync(0);
    const select = children.editorSurfaces.at(-1)!.selectRange;
    expect(select).toHaveBeenCalledWith('match', 0, 4);
    expect(select.mock.results[0]?.value).toBe(true);
    app.showing?.destroy();
  });

  it('honors an immediate search return while arrival frames and its position write are still pending', async () => {
    const { app, load, initial, releaseWrite } = await searchArrivalWithPendingWrite();
    [...app.screen.querySelectorAll('button')].find((button) => button.textContent === '返回查找前位置')!.click();
    await vi.advanceTimersByTimeAsync(40);
    expect(load).toHaveBeenCalledTimes(2);
    expect(load.mock.calls[1]?.[0].target).toEqual({ kind: 'window-start', blockId: initial.blocks[0]!.blockId });
    releaseWrite();
    await vi.advanceTimersByTimeAsync(0);
    app.showing?.destroy();
  });

  it('honors a search click during viewport arrival and returns to the click-origin window', async () => {
    const { app, pane, load, initial, releaseWrite } = await searchArrivalWithPendingWrite(false);
    const ordinaryLoad = load.getMockImplementation()!;
    let finishArrival!: (window: Awaited<ReturnType<typeof ordinaryLoad>>) => void;
    const arrival = new Promise<Awaited<ReturnType<typeof ordinaryLoad>>>((resolve) => { finishArrival = resolve; });
    load.mockImplementation((input) => input.target.kind === 'cursor' ? arrival : ordinaryLoad(input));
    Object.assign(pane, { scrollTop: 1000 });
    pane.dispatchEvent({ type: 'scroll' });
    await vi.advanceTimersByTimeAsync(0);
    expect(load).toHaveBeenCalledTimes(1);
    app.screen.querySelector<HTMLButtonElement>('.search-result button')!.click();
    await vi.advanceTimersByTimeAsync(0);
    finishArrival(await ordinaryLoad({ target: { kind: 'cursor' } }));
    await vi.advanceTimersByTimeAsync(40);
    expect(load).toHaveBeenCalledTimes(2);
    expect(children.editorSurfaces.at(-1)!.selectRange.mock.results[0]?.value).toBe(true);
    [...app.screen.querySelectorAll('button')].find((button) => button.textContent === '返回查找前位置')!.click();
    await vi.advanceTimersByTimeAsync(80);
    expect(load.mock.calls.at(-1)?.[0].target).toEqual({ kind: 'window-start', blockId: initial.blocks[0]!.blockId });
    releaseWrite();
    await vi.advanceTimersByTimeAsync(0);
    app.showing?.destroy();
  });

  it('keeps a layout-clamped edge in the current window and still pages on the next reader scroll', async () => {
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => setTimeout(callback, 16));
    const load = vi.fn(() => new Promise<never>(() => undefined));
    const rendererApi = new Proxy(api, { get: (target, key) => key === 'getManuscriptWindowAt' ? load : Reflect.get(target, key) });
    const app = shell(rendererApi);
    app.open({ ...windowOf('book-one'), nextCursor: 'next-window' });
    const pane = app.screen.querySelector('.editor-window')! as unknown as MiniElement;
    Object.assign(pane, { clientWidth: 800, clientHeight: 500, scrollHeight: 1500, scrollTop: 1000 });
    pane.dispatchEvent({ type: 'scroll' });
    await Promise.resolve();
    expect(load).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(40);
    pane.dispatchEvent({ type: 'scroll' });
    await Promise.resolve();
    await Promise.resolve();
    expect(load).toHaveBeenCalledWith(expect.objectContaining({ target: { kind: 'cursor', cursor: 'next-window' } }));
    app.showing?.destroy();
  });

  it('stays in the window when the column measure put the reading block back at its edge', async () => {
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => setTimeout(callback, 16));
    const load = vi.fn(() => new Promise<never>(() => undefined));
    const rendererApi = new Proxy(api, { get: (target, key) => key === 'getManuscriptWindowAt' ? load : Reflect.get(target, key) });
    const app = shell(rendererApi);
    app.open({ ...windowOf('book-one'), previousCursor: 'previous-window' });
    const pane = app.screen.querySelector('.editor-window')! as unknown as MiniElement;
    Object.assign(pane, { clientWidth: 800, clientHeight: 500, scrollHeight: 1500, scrollTop: 500 });
    pane.dispatchEvent({ type: 'scroll' });
    await vi.advanceTimersByTimeAsync(40);
    // A right-hand column changed and the correction rests at the top of the loaded text: not a request for the previous page.
    columnScroll.owned = true;
    Object.assign(pane, { scrollTop: 0 });
    pane.dispatchEvent({ type: 'scroll' });
    await Promise.resolve();
    await Promise.resolve();
    expect(load).not.toHaveBeenCalled();
    columnScroll.owned = false;
    pane.dispatchEvent({ type: 'scroll' });
    await Promise.resolve();
    await Promise.resolve();
    expect(load).toHaveBeenCalledWith(expect.objectContaining({ target: { kind: 'cursor', cursor: 'previous-window' } }));
    app.showing?.destroy();
  });

  it('remembers the paragraph being read when the manuscript is left, not a caret scrolled out of sight (#1703)', async () => {
    const record = vi.fn(async () => undefined);
    const app = shell(new Proxy(api, { get: (target, key) => key === 'recordManuscriptEntryPosition' ? record : Reflect.get(target, key) }));
    app.open(windowOf('book-one'));
    await vi.advanceTimersByTimeAsync(0);
    expect(record).toHaveBeenLastCalledWith({ manuscriptId: 'book-one-manuscript', branchId: 'branch-main', blockId: 'blk_3', grapheme: 0 });
    children.reading = { blockId: 'blk_read', grapheme: 0 };
    await expect(app.showing!.settle()).resolves.toBe(true);
    expect(record).toHaveBeenLastCalledWith({ manuscriptId: 'book-one-manuscript', branchId: 'branch-main', blockId: 'blk_read', grapheme: 0 });
    app.showing?.destroy();
  });

  it('keeps global destinations in the sidebar and editing actions in the toolbar', () => {
    const app = shell();
    app.open(windowOf('book-one'));
    const toolbar = app.screen.querySelector('.editor-toolbar')!;
    expect(toolbar.textContent).toContain('修订版 2');
    expect(toolbar.textContent).not.toMatch(/分支|%|查看技术详情|保存当前编辑/u);
    expect(toolbar.querySelector('nav') === null).toBe(true);
    expect([...toolbar.querySelectorAll('button')].map((button) => button.textContent))
      .toEqual(['修订 · 自动应用改动留痕，停笔后自动写入稿件，可逐条撤销。', '修订 · 待我确认改动留痕为待处理的修订卡，由你逐条应用。', '直接改稿 · 不留痕直接改动正文，不生成修订卡。', '让 AI 修改…', '', '', '重试权威刷新', '新建 / 导入衍生稿件…', '管理全部衍生稿件（0）']);
    app.showing?.destroy();
  });

  it('saves the words just typed before Ctrl+Z reads the history, so they are the step it takes back; a step set aside answers in the error tone (#1654)', async () => {
    const calls: string[] = [];
    let flushed = false;
    let readable: () => void = () => undefined;
    const read = new Promise<void>((resolve) => { readable = resolve; });
    const typing = { stepId: 'step-1', kind: 'typing', label: '编辑文字', changeCount: 1, paragraph: 3, batch: null };
    const answers = [{ blocked: false, completionLabel: '已撤销：编辑文字（第 3 段）' }, { blocked: true, completionLabel: '第 3 段在「编辑文字」之后又改过，这一步不能撤销。再按 Ctrl+Z 撤销更早的一步。' }];
    const history = new Proxy({
      platform: 'win32', recordManuscriptEntryPosition: async () => undefined,
      inspectEditorHistory: async () => { calls.push('inspect'); await read; return { branchId: 'branch-main', undo: flushed ? typing : null, redo: null }; },
      undoManuscript: async () => {
        calls.push('undo');
        return { action: 'undo', branchId: 'branch-main', revisionId: 'rev-2', revisionLabel: 'r2', journalSequence: 6, workingDigest: 'c'.repeat(64), commandGroupId: null,
          canUndo: true, canRedo: true, stepLabel: '编辑文字', anchorBlockId: null, paragraph: 3, ...answers.shift()! };
      },
      getManuscriptWindowAt: async () => ({ ...windowOf('book-one'), journalSequence: 6, workingDigest: 'c'.repeat(64) }),
      getOutline: async () => ({ entries: [], nextCursor: null }),
    } as Record<string | symbol, unknown>, { get: (known, key) => key in known ? known[key] : () => new Promise<never>(() => undefined) }) as unknown as RendererApi;
    const tones: Array<[string, string | undefined]> = [];
    const app = shell(history);
    app.open(windowOf('book-one'), { setStatus: (message, tone) => { tones.push([message, tone]); } });
    const editor = children.editors.at(-1) as EditorOptions;
    const surface = children.editorSurfaces.at(-1)!;
    // Typed within the auto-save delay: the edit is still local when Ctrl+Z comes.
    editor.onStateChange(state({ dirty: true }));
    surface.flush.mockImplementation(async () => { calls.push('flush'); flushed = true; editor.onStateChange(state({ journalSequence: 5 })); });
    const undoButton = app.screen.querySelector<HTMLButtonElement>('.editor-history-undo')!;
    const settle = async (): Promise<void> => { for (let index = 0; index < 50; index += 1) await Promise.resolve(); };
    undoButton.click();
    await settle();
    // From the press on the controls stand busy, while the edit is saved and the step is read too: no second press starts.
    expect(calls).toEqual(['flush', 'inspect']);
    expect(undoButton.disabled).toBe(true);
    readable();
    await settle();
    expect(calls.slice(0, 3)).toEqual(['flush', 'inspect', 'undo']);
    expect(tones.at(-1)).toEqual(['已撤销：编辑文字（第 3 段）', 'success']);
    undoButton.click();
    await settle();
    expect(tones.at(-1)).toEqual([expect.stringContaining('这一步不能撤销'), 'error']);
    app.showing?.destroy();
  });

  it.each(['undo', 'redo'] as const)('reopens a valid window without repeating a committed restore %s if the first paragraph disappeared', async action => {
    const initial = windowOf('book-one');
    const next = { ...initial, revisionId: 'next', workingDigest: 'c'.repeat(64), blocks: initial.blocks.map(block => ({ ...block, blockId: 'replacement' })) };
    const step = { stepId: 'restore-step', kind: 'restore', label: '恢复稿件版本', changeCount: 1 };
    const history = vi.fn(async () => ({ revisionId: next.revisionId, journalSequence: next.journalSequence, workingDigest: next.workingDigest,
      completionLabel: '稿件已刷新。', anchorBlockId: null, blocked: false }));
    const load = vi.fn(async ({ target }: { target: { kind: string } }) => {
      if (target.kind === 'window-start') throw { code: 'WINDOW_NOT_FOUND', message: '稿件位置不存在。' };
      return next;
    });
    const app = shell(new Proxy({ platform: 'win32', recordManuscriptEntryPosition: async () => undefined,
      inspectEditorHistory: async () => ({ undo: step, redo: step }), undoManuscript: history, redoManuscript: history,
      getManuscriptWindowAt: load, getOutline: async () => ({ entries: [], nextCursor: null }),
    } as Record<string | symbol, unknown>, { get: (known, key) => key in known ? known[key] : () => new Promise<never>(() => undefined) }) as unknown as RendererApi);
    const status = vi.fn();
    app.open(initial, { setStatus: status });
    const control = app.screen.querySelector<HTMLButtonElement>(action === 'undo' ? '[aria-label="撤销"]' : '[aria-label="重做"]')!;
    control.click();
    for (let tick = 0; tick < 60; tick += 1) await Promise.resolve();
    expect(history).toHaveBeenCalledTimes(1);
    expect(load.mock.calls.map(([input]) => input.target.kind)).toEqual(['window-start', 'start']);
    expect(status).toHaveBeenLastCalledWith('稿件已刷新。', 'success');
    expect(control.disabled).toBe(false);
    app.showing?.destroy();
  });

  it('reopens the later stable state only for the same editable book and branch, without replaying an acknowledged restore', async () => {
    const initial = windowOf('book-one');
    const committed = { ...initial, revisionId: 'restored', journalSequence: 5, completionLabel: '已撤销', anchorBlockId: null };
    const later = { ...initial, revisionId: 'later', journalSequence: 6, workingDigest: 'c'.repeat(64) };
    let reply = later;
    let interrupted = false;
    const send = vi.fn(async () => committed);
    const app = shell(new Proxy({ platform: 'win32', recordManuscriptEntryPosition: async () => undefined,
      inspectEditorHistory: async () => ({ undo: { kind: 'restore', changeCount: 1 } }), undoManuscript: send,
      getManuscriptWindowAt: async () => reply, getOutline: async () => ({ entries: [], nextCursor: null }),
    } as Record<string | symbol, unknown>, { get: (known, key) => key in known ? known[key] : () => new Promise<never>(() => undefined) }) as unknown as RendererApi);
    const status = vi.fn();
    app.open(initial, { setStatus: status, interrupted: () => interrupted });
    const retry = [...app.screen.querySelectorAll('button')].find(item => item.textContent === '重试权威刷新')!;
    const settle = async () => { for (let tick = 0; tick < 60; tick += 1) await Promise.resolve(); };
    app.screen.querySelector<HTMLButtonElement>('.editor-history-undo')!.click();
    await settle();
    expect(retry.hidden).toBe(false);
    for (const invalid of [{ ...later, bookId: 'other' }, { ...later, branchId: 'other' }]) {
      reply = invalid; retry.click(); await settle(); expect(retry.hidden).toBe(false);
    }
    reply = later; interrupted = true; retry.click(); await settle(); expect(retry.hidden).toBe(false);
    interrupted = false; retry.click(); await settle();
    expect(retry.hidden).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    expect(status).toHaveBeenLastCalledWith(expect.stringContaining('最新稿件'), 'success');
    app.showing?.destroy();
  });

  it('reads the existing preference and maps each menu choice without losing it in direct edit', async () => {
    setAutoApplyEditorRevisions(false);
    const app = shell();
    app.open(windowOf('book-one'));
    const trigger = app.screen.querySelector('[data-editor-input-mode-toggle]')!;
    const choose = (value: string): void => app.screen.querySelector<HTMLElement>(`[data-edit-method="${value}"]`)!.click();
    expect(trigger.textContent).toBe('修订 · 待我确认 ▾');
    choose('direct');
    expect(children.editorSurfaces.at(-1)!.setInputMode).toHaveBeenLastCalledWith('direct-edit');
    expect(getAutoApplyEditorRevisions()).toBe(false);
    expect(trigger.textContent).toBe('直接改稿 · 不留痕 ▾');
    choose('auto');
    await Promise.resolve();
    expect(children.editorSurfaces.at(-1)!.setInputMode).toHaveBeenLastCalledWith('reading-revision');
    expect(getAutoApplyEditorRevisions()).toBe(true);
    choose('confirm');
    await Promise.resolve();
    expect(getAutoApplyEditorRevisions()).toBe(false);
    expect(trigger.textContent).toBe('修订 · 待我确认 ▾');
    app.showing?.destroy();
    setAutoApplyEditorRevisions(true);
  });

  it('keeps the default with empty storage and remembers direct editing across books until changed back', async () => {
    const saved = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => saved.set(key, value) });
    setAutoApplyEditorRevisions(true);
    const app = shell();
    app.open(windowOf('book-one'));
    expect((children.editors.at(-1) as EditorOptions).initialInputMode).toBe('reading-revision');
    expect(saved.has('ai7.editor.directEditMode')).toBe(false);
    app.screen.querySelector<HTMLElement>('[data-edit-method="direct"]')!.click();
    expect(saved.get('ai7.editor.directEditMode')).toBe('true');
    app.open(windowOf('book-two'));
    expect((children.editors.at(-1) as EditorOptions).initialInputMode).toBe('direct-edit');
    expect(app.screen.querySelector('[data-editor-input-mode-toggle]')!.textContent).toBe('直接改稿 · 不留痕 ▾');
    app.screen.querySelector<HTMLElement>('[data-edit-method="confirm"]')!.click();
    await Promise.resolve();
    expect(saved.get('ai7.editor.directEditMode')).toBe('false');
    app.open(windowOf('book-one'));
    expect((children.editors.at(-1) as EditorOptions).initialInputMode).toBe('reading-revision');
    expect(app.screen.querySelector('[data-editor-input-mode-toggle]')!.textContent).toBe('修订 · 待我确认 ▾');
    app.showing?.destroy();
    setAutoApplyEditorRevisions(true);
  });

  it('returns keyboard choices to the method trigger and leaves a re-selected choice unannounced', async () => {
    setAutoApplyEditorRevisions(true);
    const app = shell(); app.open(windowOf('book-one'));
    const menu = app.screen.querySelector<HTMLDetailsElement>('.edit-method-menu')!;
    const trigger = menu.querySelector('summary')!;
    app.persistenceStatus.textContent = '保持当前状态';
    menu.open = true;
    const current = menu.querySelector<HTMLElement>('[data-edit-method="auto"]')!;
    current.focus(); current.click();
    expect(app.persistenceStatus.textContent).toBe('保持当前状态');
    expect(miniDocument.activeElement).toBe(trigger);
    menu.open = true;
    const confirm = menu.querySelector<HTMLElement>('[data-edit-method="confirm"]')!;
    confirm.focus(); confirm.click(); await Promise.resolve();
    expect(menu.open).toBe(false);
    expect(miniDocument.activeElement).toBe(trigger);
    app.showing?.destroy(); setAutoApplyEditorRevisions(true);
  });

  it('reveals paging links only near their loaded window boundary', () => {
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => setTimeout(callback, 16));
    const app = shell();
    app.open({ ...windowOf('book-one'), previousCursor: 'before', nextCursor: 'after' });
    const pane = app.screen.querySelector('.editor-window')! as unknown as MiniElement;
    const [previous, next] = app.screen.querySelectorAll<HTMLButtonElement>('.window-actions button');
    Object.assign(pane, { clientWidth: 800, clientHeight: 500, scrollHeight: 1500, scrollTop: 500 });
    pane.dispatchEvent({ type: 'scroll' });
    expect([previous!.hidden, next!.hidden]).toEqual([true, true]);
    Object.assign(pane, { scrollTop: 984 });
    pane.dispatchEvent({ type: 'scroll' });
    expect([previous!.hidden, next!.hidden]).toEqual([true, false]);
    Object.assign(pane, { scrollTop: 16 });
    pane.dispatchEvent({ type: 'scroll' });
    expect([previous!.hidden, next!.hidden]).toEqual([false, true]);
    app.showing?.destroy();
  });

  it('offers both available boundary links when a window fits without any scrolling', () => {
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => setTimeout(callback, 16));
    let resize = (): void => {};
    vi.stubGlobal('ResizeObserver', class { constructor(callback: () => void) { resize = callback; } observe() {} disconnect() {} });
    const app = shell();
    app.open({ ...windowOf('book-one'), previousCursor: 'before', nextCursor: 'after' });
    const pane = app.screen.querySelector('.editor-window')!;
    Object.assign(pane, { clientWidth: 800, clientHeight: 500, scrollHeight: 500, scrollTop: 0 });
    resize();
    expect([...app.screen.querySelectorAll<HTMLButtonElement>('.window-actions button')].map((item) => [item.hidden, item.disabled]))
      .toEqual([[false, false], [false, false]]);
    app.showing?.destroy();
  });

  it('badges 批注 with the Book\'s pending marks from the rail, 2000+ once the list stops there, and never before it was read (#1523)', async () => {
    const app = shell();
    app.open(windowOf('book-one'));
    const badge = app.screen.querySelector<HTMLElement>('[data-edge-entry="comments"] .edge-badge')!;
    expect(badge.hidden).toBe(true);
    const rail = (count: number, marksTruncated: boolean): ManuscriptRailProjection => ({ manuscriptId: 'm', branchId: 'b', revisionId: 'r', journalSequence: 1,
      totalCharacters: 100, chapters: [], chaptersTruncated: false, uncovered: null, marksTruncated,
      marks: Array.from({ length: count }, (_, index) => ({ kind: 'annotation' as const, blockId: `blk_${index}`, proportion: index / 100 })) });
    children.rails.at(-1)!.onRead!(rail(3, false));
    expect([badge.hidden, badge.dataset['count']]).toEqual([false, '3']);
    expect(children.marks.at(-1)!.bookPendingChanged).toHaveBeenCalled();
    children.rails.at(-1)!.onRead!(rail(2000, true));
    expect(badge.dataset['count']).toBe('2000+');
    expect(app.screen.querySelector('[data-edge-entry="comments"]')!.getAttribute('aria-label')).toBe('批注 · 2000+');
    children.rails.at(-1)!.onRead!(rail(0, false));
    expect(badge.hidden).toBe(true);
    app.showing?.destroy();
  });

  it('counts a chapter\'s marks only where it has some, and the outline\'s own headings in its footer', async () => {
    const style = Object.getOwnPropertyDescriptor(MiniElement.prototype, 'style')!;
    Object.defineProperty(MiniElement.prototype, 'style', { configurable: true, value: { setProperty: vi.fn() } });
    try {
      const entries = ['blk_3', 'omitted'].map((blockId) => ({ blockId, kind: 'heading', level: 1, text: blockId, displayTextTruncated: false }));
      const rendererApi = new Proxy(api, { get: (target, key) => key === 'getOutline' ? async () => ({ entries, previousCursor: null, nextCursor: null }) : Reflect.get(target, key) });
      const app = shell(rendererApi);
      app.open(windowOf('book-one'));
      children.rails.at(-1)!.onRead!({ manuscriptId: 'm', branchId: 'b', revisionId: 'r', journalSequence: 1, totalCharacters: 100,
        chapters: [{ blockId: 'blk_3', title: '第一章', level: 1, proportion: .25, suggestions: 0, annotations: 1, notes: 0 }], chaptersTruncated: true,
        marks: [], marksTruncated: false, uncovered: null });
      await vi.advanceTimersByTimeAsync(0);
      // A chapter's marks are one light count where it has some (Issue #1409); none is drawn for a chapter without.
      const rows = app.screen.querySelectorAll('.outline-list .outline-entry');
      expect(rows[0]!.querySelector('.outline-marks')?.textContent).toBe('1 处标记');
      expect(rows[1]!.querySelector('.outline-marks')).toBeNull();
      expect(app.screen.querySelector('.navigation-footer')!.textContent).toContain('共 2 个章节标题');
      app.showing?.destroy();
    } finally { Object.defineProperty(MiniElement.prototype, 'style', style); }
  });

  it.each(['modes', 'editor'] as const)(
    'leaves a mount that threw after attaching (%s) readable, settleable and destroyed once, and a later mount attaches',
    async (failAt) => {
      const app = shell();
      children.failAt = failAt;
      expect(() => app.open(windowOf('book-one'))).toThrow(`${failAt} mount failed`);
      const failed = app.showing!;
      expect(failed.bookId).toBe('book-one');
      // What the shell asks of the screen on display before it leaves or replaces it: no place, a free leave.
      expect(failed.readingPlace()).toBeNull();
      await expect(failed.settle()).resolves.toBe(true);
      failed.destroy();
      const torn = [...children.destroyed];
      expect(torn).toContain('save-menu');
      failed.destroy();
      expect(children.destroyed).toEqual(torn);
      expect(app.persistenceStatus.getAttribute('role')).toBe('status');
      expect(app.persistenceStatus.hasAttribute('tabindex')).toBe(false);

      children.failAt = null;
      app.open(windowOf('book-one'));
      const next = app.showing!;
      expect(next).not.toBe(failed);
      expect(children.destroyed).toEqual(torn);
      expect(next.readingPlace()).toMatchObject({ manuscriptId: 'book-one-manuscript', blockId: 'blk_3' });
      await expect(next.settle()).resolves.toBe(true);
      expect(app.persistenceStatus.getAttribute('role')).toBe('button');
    },
  );

  it('lets a journal write still in flight at departure clear the close risk without speaking over the next screen', () => {
    const app = shell();
    app.open(windowOf('book-one'));
    const editor = children.editors.at(-1) as EditorOptions;
    const protection = children.protections.at(-1)!;
    editor.onStateChange(state({ dirty: true, saving: true }));
    expect(app.closeRisk).toBe(true);

    app.leave('已打开恢复比较。');
    const updatesAtDeparture = protection.update.mock.calls.length;
    editor.onAnnouncement('修订日志已写入。', 'success');
    editor.onStateChange(state({ journalSequence: 5 }));
    expect(app.closeRisk).toBe(false);
    expect(app.persistenceStatus.textContent).toBe('已打开恢复比较。');
    expect(protection.update.mock.calls.length).toBe(updatesAtDeparture);
  });
});

it('scans the manuscript screen in ordinary mode (#1315)', () => {
  setTechnicalLayerVisible(false);
  try { const app = shell(); app.open(windowOf('book-one')); expectNoTechnicalText(app.screen); app.showing?.destroy(); }
  finally { setTechnicalLayerVisible(true); }
});

vi.mock('../../src/renderer/action-defaults.js', () => ({ readActionDefaults: async () => ({ ...DEFAULT_QUICK_ACTIONS }), rememberActionDefaults: async () => undefined }));

describe('a derivative document on 稿件 (Issues #1403–#1405)', () => {
  const documentOf = (bookId: string, title: string) => ({
    title, documentId: `${bookId}-manuscript`, branchId: 'branch-main', createdAt: '2026-11-07T00:00:00.000Z',
    origin: { sourceVersionId: 'source', displayName: '新闻稿.docx', marksNotCarried: 0, drafted: false, blank: true },
    versions: [{ revisionId: 'rev-2', label: '版本 1', ordinal: 1, createdAt: '2026-11-07T00:00:00.000Z', revisionDigest: 'a'.repeat(64) }],
    versionsTruncated: false, changedSinceVersion: false, journalSequence: 4, workingDigest: 'a'.repeat(64),
    deliveries: [], deliveriesTruncated: false, changedSinceDelivery: false,
    workflow: { profile: { id: 'p', name: '流程', version: '1', activatedAt: '2026-11-07T00:00:00.000Z' }, summary: '', next: [], phases: [], transitions: 0 },
  });
  const documentsOf = (bookId: string, title: string) => ({
    bookId, configuration: { schema: 's', version: '1', digest: 'd' }, unavailableReason: null, sources: [], sourcesTruncated: false,
    types: [{ typeId: 'news-release', label: '新闻稿', notForThisBook: false, documents: [documentOf(bookId, title)], document: documentOf(bookId, title) }],
  });

  it('keeps the derivative menu open and focused through writing polls and returns form cancellation to its trigger', async () => {
    const methods = { inspectProductionDocuments: async () => documentsOf('book-one', '首发通稿') };
    const app = shell(new Proxy(api, { get: (target, key) => key in methods ? methods[key as keyof typeof methods] : Reflect.get(target, key) }));
    app.open(windowOf('book-one')); await vi.advanceTimersByTimeAsync(0);
    const mountedMenu = app.screen.querySelector('.derivative-menu')!;
    const mountedPanel = mountedMenu.querySelector('.ui-menu-panel');
    for (const selector of ['[data-derivative-menu]', '[data-manuscript-switch="new"]', '[data-manuscript-switch="manage"]']) {
      app.screen.querySelector<HTMLDetailsElement>('.derivative-menu')!.open = true;
      app.screen.querySelector<HTMLElement>(selector)!.focus();
      const focusedItem = miniDocument.activeElement;
      children.writingStates.at(-1)!({ underWay: true, drafted: 0 });
      expect(app.screen.querySelector('.derivative-menu')).toBe(mountedMenu);
      expect(mountedMenu.querySelector('.ui-menu-panel')).toBe(mountedPanel);
      expect(miniDocument.activeElement).toBe(focusedItem);
      expect(app.screen.querySelector<HTMLDetailsElement>('.derivative-menu')!.open).toBe(true);
      expect(miniDocument.activeElement).toBe(app.screen.querySelector(selector));
    }
    app.screen.querySelector<HTMLElement>('[data-manuscript-switch="new"]')!.click();
    app.screen.querySelector<HTMLElement>('[data-document-action="cancel-derivative"]')!.click();
    expect(miniDocument.activeElement).toBe(app.screen.querySelector('[data-derivative-menu]'));
    app.screen.querySelector<HTMLElement>('[data-manuscript-switch="new"]')!.click();
    (app.screen.querySelector('.derivative-create-form') as unknown as MiniElement).dispatchEvent({ type: 'keydown', key: 'Escape', bubbles: true, preventDefault() {} });
    expect(miniDocument.activeElement).toBe(app.screen.querySelector('[data-derivative-menu]'));
    app.showing?.destroy();
  });

  it('lists the manuscript and its documents, and renames the open document in place without remounting its editor', async () => {
    setTechnicalLayerVisible(false);
    const rename = vi.fn(async ({ title }: { title: string }) => ({
      bookId: 'book-one', typeId: 'news-release', notice: null, documents: documentsOf('book-one', title), document: documentOf('book-one', title),
    }));
    const methods = {
      inspectProductionDocuments: async () => documentsOf('book-one', '首发通稿'),
      inspectWritingTask: async () => ({ bookId: 'book-one', unavailable: null, task: null, types: [], references: {}, consequences: {} }),
      renameProductionDocument: rename,
    };
    const app = shell(new Proxy(api, { get: (target, key) => key in methods ? methods[key as keyof typeof methods] : Reflect.get(target, key) }));
    app.open({ ...windowOf('book-one'), deliverable: 'production-document' } as ManuscriptWindowProjection,
      { productionDocument: { typeId: 'news-release', typeLabel: '新闻稿', document: documentOf('book-one', '首发通稿') as never } });
    await vi.advanceTimersByTimeAsync(0);
    const switches = [...app.screen.querySelectorAll<HTMLButtonElement>('[data-manuscript-switch]')].map((node) => [node.dataset['manuscriptSwitch'], node.textContent, node.getAttribute('aria-current')]);
    expect(switches).toEqual([['primary', '主稿件（《合成书》）', null], ['document', '[新闻稿] 首发通稿', 'page'], ['new', '新建 / 导入衍生稿件…', null], ['manage', '管理全部衍生稿件（1）', null]]);
    // Ordinary mode: no seven phases, no 交付 in the document's lens, and its 批注栏 is offered.
    expect(app.screen.querySelector('.document-lens')?.textContent).not.toContain('交付');
    expect(app.screen.querySelector('[data-edge-entry="comments"]')).not.toBeNull();
    const editors = children.editors.length;
    app.screen.querySelector<HTMLButtonElement>('[data-document-action="rename"]')!.click();
    const input = app.screen.querySelector<HTMLInputElement>('.document-title-input')!;
    expect(input.value).toBe('首发通稿');
    input.value = '书展宣传稿';
    (input as unknown as MiniElement).dispatchEvent({ type: 'keydown', key: 'Enter' });
    await vi.advanceTimersByTimeAsync(0);
    expect(rename).toHaveBeenCalledWith({ documentId: 'book-one-manuscript', title: '书展宣传稿' });
    expect(app.screen.querySelector('.document-title-heading')?.textContent).toBe('书展宣传稿');
    expect(app.screen.querySelector('.document-title-input')).toBeNull();
    expect(app.screen.querySelector('[data-manuscript-switch="document"]')?.textContent).toBe('[新闻稿] 书展宣传稿');
    // Only the name moved: the same editor holds the text.
    expect(children.editors.length).toBe(editors);
    expect(children.destroyed).not.toContain('editor');
    app.showing?.destroy();
  });

  it('cancels a rename with Escape and keeps the title', async () => {
    setTechnicalLayerVisible(false);
    const rename = vi.fn();
    const methods = { inspectProductionDocuments: async () => documentsOf('book-one', '首发通稿'), renameProductionDocument: rename };
    const app = shell(new Proxy(api, { get: (target, key) => key in methods ? methods[key as keyof typeof methods] : Reflect.get(target, key) }));
    app.open({ ...windowOf('book-one'), deliverable: 'production-document' } as ManuscriptWindowProjection,
      { productionDocument: { typeId: 'news-release', typeLabel: '新闻稿', document: documentOf('book-one', '首发通稿') as never } });
    app.screen.querySelector<HTMLButtonElement>('[data-document-action="rename"]')!.click();
    const input = app.screen.querySelector<HTMLInputElement>('.document-title-input')!;
    input.value = '别的题目';
    (input as unknown as MiniElement).dispatchEvent({ type: 'keydown', key: 'Escape' });
    expect(rename).not.toHaveBeenCalled();
    expect(app.screen.querySelector('.document-title-heading')?.textContent).toBe('首发通稿');
    expect(app.screen.querySelector('.document-title-input')).toBeNull();
    app.showing?.destroy();
  });
});

vi.mock('../../src/renderer/right-column.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/renderer/right-column.js')>(),
  mountColumnMeasure: () => ({ destroy: vi.fn(), ownsScroll: () => columnScroll.owned }),
}));
/** Whether the column measure says the pane's offset is the one it just put the reading block back at. */
const columnScroll = vi.hoisted(() => ({ owned: false }));

/** The shell around the screen with the real drawer, wired as `index.ts` wires them, and in `replaceScreen`'s order. */
function columnShell() {
  vi.stubGlobal('window', { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout, setInterval: globalThis.setInterval, clearInterval: globalThis.clearInterval, getSelection: () => null });
  const app = shell();
  let showing: ManuscriptScreen | null = null;
  const drawerRoot = document.createElement('aside');
  document.body.append(drawerRoot);
  const drawer = mountTaskDrawer({
    root: drawerRoot, shell: document.body, api, technicalDetails: () => document.createElement('div'),
    errorMessage: (_error: unknown, fallback: string) => fallback, errorCode: () => null, setStatus: vi.fn(), settle: async () => true,
    resumeDraft: (_bookId: string, resume: () => void) => resume(), onRecorded: vi.fn(),
    onOpen: () => showing?.closeSupportingPanel(), onClose: () => showing?.restoreSupportingPanel(),
  } as unknown as MountTaskDrawerOptions);
  const open = (initialWindow: ManuscriptWindowProjection, extra: Partial<ScreenOptions> = {}): void => app.open(initialWindow, {
    taskDrawer: drawer,
    // replaceScreen: the departing screen is destroyed and the handle cleared, the drawer follows, then the handle is installed.
    attach: (content, surface) => {
      showing?.destroy(); showing = null;
      app.screen.replaceChildren(content);
      drawer.followScreen('editor', content.dataset['bookId'] ?? null);
      showing = surface;
    },
    ...extra,
  });
  const pane = (): HTMLElement => app.screen.querySelector<HTMLElement>('.manuscript-comments-pane')!;
  const entry = (name: string): HTMLButtonElement => app.screen.querySelector<HTMLButtonElement>(`[data-edge-entry="${name}"]`)!;
  return { ...app, open, drawer, drawerRoot, pane, entry, get showing(): ManuscriptScreen | null { return showing; } };
}

describe('the one right-hand column (#1542)', () => {
  let setItem: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    setItem = vi.fn();
    vi.stubGlobal('localStorage', { getItem: () => 'true', setItem });
  });

  it('lets 分析, the 任务 panel and every drawer view replace the 批注栏 and give it back, without a preference write', () => {
    children.realParagraphAnalysis = true;
    let commands: Record<string, () => void> = {};
    const app = columnShell();
    app.open(windowOf('book-one'), {
      commandDispatcher: { register: (handlers: typeof commands) => { commands = handlers; return () => {}; } } as unknown as ScreenOptions['commandDispatcher'],
    });
    const analysis = app.screen.querySelector<HTMLElement>('.paragraph-analysis-panel')!;
    const marks = children.marks.at(-1)!;
    const shows = (): unknown[] => [app.pane().hidden, analysis.hidden, app.drawerRoot.hidden];
    expect(shows()).toEqual([false, true, true]);
    app.entry('analysis').click();
    expect(shows()).toEqual([true, false, true]);
    // The pane is replaced, so its edge entry does not say it is open.
    expect(app.entry('comments').getAttribute('aria-expanded')).toBe('false');
    marks.refreshComments.mockClear();
    analysis.dispatchEvent({ type: 'keydown', key: 'Escape' } as never);
    expect(shows()).toEqual([false, true, true]);
    expect(marks.refreshComments).toHaveBeenCalled();
    app.entry('analysis').click(); app.entry('analysis').click();
    expect(shows()).toEqual([false, true, true]);

    app.entry('tasks').click();
    expect(shows()).toEqual([true, true, false]);
    app.entry('tasks').click();
    expect(shows()).toEqual([false, true, true]);
    const views: Array<[string, () => void]> = [
      ['plan', () => app.drawer.open({ bookId: 'book-one', kind: 'baseline-analysis', ref: 'plan' }, () => null)],
      ['run', () => app.drawer.open({ bookId: 'book-one', kind: 'baseline-analysis', ref: 'plan' }, () => null, undefined, { view: 'run' })],
      ['dialogue', () => app.drawer.openDialogue('book-one', 'dialogue-1', () => null)],
      ['composer', () => app.drawer.openComposer({ bookId: 'book-one', bookTitle: '合成书', origin: 'composer-book', manuscript: null, ranges: [] }, () => null)],
      ['launch', () => app.drawer.openLaunch({ operation: 'launchBaselineAnalysis', bookId: 'book-one', title: '分析', input: { goal: BASELINE_ANALYSIS_TASK_GOAL, update: null } }, () => null)],
    ];
    for (const [view, openView] of views) {
      openView();
      expect([view, ...shows()]).toEqual([view, true, true, false]);
      app.drawer.close(false);
      expect([view, ...shows()]).toEqual([view, false, true, true]);
    }

    // Nested: 导航 over the drawer suspends it, closing 导航 brings the drawer back, closing that brings the pane back.
    app.entry('tasks').click();
    app.entry('navigation').click();
    const outline = app.screen.querySelector<HTMLElement>('.manuscript-navigator:not(.paragraph-analysis-panel)')!;
    expect([app.pane().hidden, app.drawerRoot.hidden, outline.hidden]).toEqual([true, true, false]);
    app.entry('navigation').click();
    expect(shows()).toEqual([true, true, false]);
    app.drawer.close(false);
    for (const key of ['search.find', 'edit.replace']) {
      commands[key]!(); expect(app.pane().hidden).toBe(true);
      app.entry('navigation').click(); expect(app.pane().hidden).toBe(false);
    }
    expect(setItem).not.toHaveBeenCalled();
    app.screen.querySelector<HTMLButtonElement>('[aria-label="关闭批注栏"]')!.click();
    expect(setItem).toHaveBeenCalledWith('ai7.comments-pane.book-one', 'false');
    app.showing!.destroy();
  });

  it('gives each right-edge entry its own symbol, none borrowed from a sidebar destination (#1554)', () => {
    const app = columnShell();
    app.open(windowOf('book-one'));
    const ids = [...app.screen.querySelectorAll<HTMLElement>('[data-edge-entry]')]
      .map((entry) => entry.querySelector<HTMLElement>('.icon')?.dataset['icon'] ?? '');
    expect(ids).toEqual(['i-nav', 'i-paragraph-analysis', 'i-task', 'i-comment']);
    for (const id of ids) expect(ICON_IDS).toContain(id);
    expect(new Set(ids).size).toBe(ids.length);
    const sidebar = [
      ...SHELL_DESTINATIONS.map((entry) => entry.icon),
      ...SHELL_BOOK_GROUPS.flatMap((group) => group.sections.map((section) => section.icon)),
      SHELL_AGENT_WORKSPACE_ROW.icon, SHELL_SETTINGS.icon, SHELL_MORE_BOOKS_ICON,
    ];
    for (const id of ids) expect(sidebar).not.toContain(id);
    app.showing!.destroy();
  });

  it('reads the cards again when the pane comes back: after arriving with the drawer open, and after a marks change while replaced', () => {
    const app = columnShell();
    app.open(windowOf('book-one'));
    app.drawer.openPanel('book-one', () => null);
    app.open(windowOf('book-one'));
    expect([app.pane().hidden, app.drawerRoot.hidden]).toEqual([true, false]);
    const arrived = children.marks.at(-1)!;
    arrived.refreshComments.mockClear();
    app.drawer.close(false);
    expect(app.pane().hidden).toBe(false);
    expect(arrived.refreshComments).toHaveBeenCalled();

    app.entry('navigation').click();
    app.showing!.refreshMarks();
    arrived.refreshComments.mockClear();
    app.entry('navigation').click();
    expect(app.pane().hidden).toBe(false);
    expect(arrived.refreshComments).toHaveBeenCalled();
    app.showing!.destroy();
  });

  it('shows the next Book its own pane when the drawer closes for it', () => {
    const app = columnShell();
    app.open(windowOf('book-a'));
    app.drawer.openPanel('book-a', () => null);
    expect(app.pane().hidden).toBe(true);
    app.open(windowOf('book-b'));
    expect([app.pane().hidden, app.drawerRoot.hidden]).toEqual([false, true]);
    app.showing!.destroy();
  });

  it('never shows the pane beside the drawer when the same Book mounts again under a suspended drawer', () => {
    const app = columnShell();
    app.open(windowOf('book-a'));
    app.drawer.openPanel('book-a', () => null);
    app.entry('navigation').click();
    expect(app.drawerRoot.hidden).toBe(true);
    app.open(windowOf('book-a'));
    expect([app.pane().hidden, app.drawerRoot.hidden]).toEqual([true, false]);
    app.drawer.close(false);
    expect([app.pane().hidden, app.drawerRoot.hidden]).toEqual([false, true]);
    expect(setItem).not.toHaveBeenCalled();
    app.showing!.destroy();
  });
});
