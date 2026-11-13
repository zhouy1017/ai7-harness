import { setAutoApplyEditorRevisions, getAutoApplyEditorRevisions } from '../../src/renderer/editor-input-mode.js';
import { DEFAULT_QUICK_ACTIONS } from '../../src/shared/preferences.js';
import { setTechnicalLayerVisible } from '../../src/renderer/technical-layer.js';
import { expectNoTechnicalText } from '../support/technical-layer-scan.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountManuscriptScreen, type ManuscriptScreen } from '../../src/renderer/manuscript-screen.js';
import type { mountBoundedEditor } from '../../src/renderer/editor.js';
import { readReturnPlace } from '../../src/renderer/reading-return.js';
import { installMiniDom, miniDocument, MiniElement } from '../support/mini-dom.js';
import type { ManuscriptRailProjection, ManuscriptWindowProjection, RendererApi } from '../../src/shared/protocol.js';

// The Manuscript screen's own lifecycle (Issue #1127, revision 3), on its actual mount with each child owner and the service
// as a boundary double: a mount that throws after the shell attached it can still be read, settled and destroyed, once, and
// a journal write still in flight when its screen leaves clears the window's close risk without speaking over the next screen.

type ScreenOptions = Parameters<typeof mountManuscriptScreen>[0];
type EditorOptions = Parameters<typeof mountBoundedEditor>[0];
type EditorState = Parameters<EditorOptions['onStateChange']>[0];

const children = vi.hoisted(() => ({
  failAt: null as 'modes' | 'editor' | null,
  destroyed: [] as string[],
  editors: [] as unknown[],
  editorSurfaces: [] as Array<{ selectRange: ReturnType<typeof vi.fn>; focus: ReturnType<typeof vi.fn>; setInputMode: ReturnType<typeof vi.fn>; selectedRange: ReturnType<typeof vi.fn> }>,
  marks: [] as Array<{ recordAndApplyEditorRevision: ReturnType<typeof vi.fn> }>,
  protections: [] as Array<{ update: ReturnType<typeof vi.fn> }>,
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
vi.mock('../../src/renderer/paragraph-analysis.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/renderer/paragraph-analysis.js')>(),
  mountParagraphAnalysis: () => ({ refresh: vi.fn(), close: vi.fn(), toggle: vi.fn(), destroy: () => children.destroyed.push('paragraph-analysis') }),
}));
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
    };
    children.marks.push(surface);
    return surface;
  },
}));
vi.mock('../../src/renderer/reading-return.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/renderer/reading-return.js')>(),
  readReturnPlace: vi.fn(async () => null),
  preserveReturnPlace: async (place: unknown) => place,
  consumeReturnPlace: async () => null,
}));
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
      captureNavigationContinuity: () => ({ anchor: point, head: point, direction: 'forward', scrollAnchor: { blockId: point.blockId, offset: 0 }, focused: true }),
      currentWindow: () => currentWindow,
      loadWindow: vi.fn((next: ManuscriptWindowProjection) => { currentWindow = next; return true; }),
      loadNavigationWindow: vi.fn((next: ManuscriptWindowProjection) => { currentWindow = next; return true; }),
      selectRange: vi.fn((blockId: string) => currentWindow.blocks.some((block) => block.blockId === blockId)),
      highlightJump: vi.fn(), highlightAppliedRange: vi.fn(),
      inputModeValue: 'reading-revision' as 'reading-revision' | 'direct-edit',
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
    taskDrawer: { close: vi.fn(), openPanel: vi.fn(), openDialogue: vi.fn(), openComposer: vi.fn() } as unknown as ScreenOptions['taskDrawer'],
    interrupted: () => false,
    attach: (content, surface) => { replace(content); showing = surface; },
    setContextActions: (...nodes) => contextView.replaceChildren(...nodes), setStatus, setCloseRisk: (risk) => { closeRisk = risk; },
    errorMessage: (_error, fallback) => fallback, recentlyActivatedControl: () => null, awaitServiceJob: async (job) => job,
    composerRangeOf: vi.fn(), selectionTaskOffer: vi.fn(), selectionProcedureOffer: vi.fn(), prepareSelectionTask: vi.fn(),
    renderEditorWindow: vi.fn(), renderBookAnalysis: vi.fn(),
    renderBookReview: vi.fn(), renderBookDeliverables: vi.fn(),
    renderProposalConflict: vi.fn(), renderProposalWorkspace: vi.fn(), returnToRecoveryComparison: vi.fn(),
    openPrimaryManuscript: vi.fn(async () => undefined), openProductionDocument: vi.fn(async () => undefined), openWritingPlan: vi.fn(),
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
  children.destroyed.length = 0;
  children.editors.length = 0;
  children.editorSurfaces.length = 0;
  children.protections.length = 0;
  children.rails.length = 0;
  children.marks.length = 0;
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); restore(); });

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
  it('keeps the full long outline heading available to assistive tools and its title', async () => {
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
    } finally { Reflect.deleteProperty(MiniElement.prototype, 'style'); }
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

  it('keeps global destinations in the sidebar and editing actions in the toolbar', () => {
    const app = shell();
    app.open(windowOf('book-one'));
    const toolbar = app.screen.querySelector('.editor-toolbar')!;
    expect(toolbar.textContent).toContain('修订版 2');
    expect(toolbar.textContent).not.toMatch(/分支|%|查看技术详情|保存当前编辑/u);
    expect(toolbar.querySelector('nav') === null).toBe(true);
    expect([...toolbar.querySelectorAll('button')].map((button) => button.textContent))
      .toEqual(['修订 · 自动应用改动留痕，停笔后自动写入稿件，可逐条撤销。', '修订 · 待我确认改动留痕为待处理的修订卡，由你逐条应用。', '直接改稿 · 不留痕直接改动正文，不生成修订卡。', '让 AI 修改…', '', '', '重试权威刷新']);
    app.showing?.destroy();
  });

  it('reads the existing preference and maps each menu choice without losing it in direct edit', () => {
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
    expect(children.editorSurfaces.at(-1)!.setInputMode).toHaveBeenLastCalledWith('reading-revision');
    expect(getAutoApplyEditorRevisions()).toBe(true);
    choose('confirm');
    expect(getAutoApplyEditorRevisions()).toBe(false);
    expect(trigger.textContent).toBe('修订 · 待我确认 ▾');
    app.showing?.destroy();
    setAutoApplyEditorRevisions(true);
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

  it('counts a chapter\'s marks only where it has some, and the outline\'s own headings in its footer', async () => {
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
    } finally { Reflect.deleteProperty(MiniElement.prototype, 'style'); }
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
