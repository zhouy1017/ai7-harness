import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountManuscriptScreen, type ManuscriptScreen } from '../../src/renderer/manuscript-screen.js';
import type { mountBoundedEditor } from '../../src/renderer/editor.js';
import { installMiniDom, miniDocument, MiniElement } from '../support/mini-dom.js';
import type { ManuscriptWindowProjection, RendererApi } from '../../src/shared/protocol.js';

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
  protections: [] as Array<{ update: ReturnType<typeof vi.fn> }>,
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
  mountPositionRail: () => ({ setPosition: vi.fn(), refresh: vi.fn(), destroy: () => children.destroyed.push('rail') }),
}));
vi.mock('../../src/renderer/editorial-marks.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/renderer/editorial-marks.js')>(),
  mountEditorialMarks: () => ({
    selectionSpan: vi.fn(), composeProcedures: vi.fn(), openMark: vi.fn(async () => undefined), holdsFloating: () => false,
    ownsScroll: () => false, reanchor: vi.fn(), destroy: () => children.destroyed.push('marks'),
  }),
}));
vi.mock('../../src/renderer/reading-return.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/renderer/reading-return.js')>(),
  readReturnPlace: async () => null,
  preserveReturnPlace: async (place: unknown) => place,
  consumeReturnPlace: async () => null,
}));
vi.mock('../../src/renderer/editor.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/renderer/editor.js')>(),
  mountBoundedEditor: (options: EditorOptions) => {
    if (children.failAt === 'editor') throw new Error('editor mount failed');
    const point = { blockId: options.initialWindow.blocks[0]!.blockId, grapheme: 0 };
    children.editors.push(options);
    return {
      focus: vi.fn(), flush: vi.fn(async () => undefined), interrupt: vi.fn(), setOperationLocked: vi.fn(), setMarks: vi.fn(),
      captureContinuity: () => ({ anchor: point, head: point, direction: 'forward', scrollAnchor: { blockId: point.blockId, offset: 0 }, focused: true }),
      currentWindow: () => options.initialWindow,
      isComposing: () => false,
      isOwnScroll: () => false,
      protection: () => null,
      destroy: () => children.destroyed.push('editor'),
    };
  },
}));

const windowOf = (bookId: string): ManuscriptWindowProjection => ({
  bookId, manuscriptId: `${bookId}-manuscript`, branchId: 'branch-main', revisionId: 'rev-2', revisionLabel: 'r2',
  journalSequence: 4, workingDigest: 'a'.repeat(64), deliverable: 'manuscript', recoveredStateReview: null,
  position: { label: '第 3 段', proportion: 0.25, structureLabel: '第一章' },
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
function shell() {
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
  const open = (initialWindow: ManuscriptWindowProjection): void => mountManuscriptScreen({
    api, initialWindow, bookTitle: '合成书', persistenceStatus, contextView,
    viewPreferences: {} as ScreenOptions['viewPreferences'],
    preferences: { current: { 'analysis.lastViewedRevision': {} }, viewAnalysis: vi.fn() } as unknown as ScreenOptions['preferences'],
    commandDispatcher: { register: () => () => children.destroyed.push('commands') } as unknown as ScreenOptions['commandDispatcher'],
    taskDrawer: { close: vi.fn(), openPanel: vi.fn(), openDialogue: vi.fn(), openComposer: vi.fn() } as unknown as ScreenOptions['taskDrawer'],
    interrupted: () => false,
    attach: (content, surface) => { replace(content); showing = surface; },
    setContextActions: vi.fn(), setStatus, setCloseRisk: (risk) => { closeRisk = risk; },
    errorMessage: (_error, fallback) => fallback, recentlyActivatedControl: () => null, awaitServiceJob: vi.fn(),
    composerRangeOf: vi.fn(), selectionTaskOffer: vi.fn(), selectionProcedureOffer: vi.fn(), prepareSelectionTask: vi.fn(),
    renderEditorWindow: vi.fn(), renderBookOverview: vi.fn(), renderBookAnalysis: vi.fn(), renderBookSources: vi.fn(),
    renderBookReview: vi.fn(), renderBookDeliverables: vi.fn(), renderBookEvaluation: vi.fn(), renderBookFindings: vi.fn(),
    renderProposalConflict: vi.fn(), renderProposalWorkspace: vi.fn(), returnToRecoveryComparison: vi.fn(),
  });
  return {
    persistenceStatus, open,
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
  }));
  children.failAt = null;
  children.destroyed.length = 0;
  children.editors.length = 0;
  children.protections.length = 0;
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); restore(); });

describe('the Manuscript screen lifecycle', () => {
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
