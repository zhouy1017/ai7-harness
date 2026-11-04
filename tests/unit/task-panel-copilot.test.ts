import { setTechnicalLayerVisible } from '../../src/renderer/technical-layer.js';
import { expectNoTechnicalText } from '../support/technical-layer-scan.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookTasksProjection } from '../../src/shared/protocol.js';
import { installMiniDom, miniDocument, MiniElement } from '../support/mini-dom.js';
import { mountTaskDrawer, type MountTaskDrawerOptions, type TaskDrawerSurface } from '../../src/renderer/task-drawer.js';

// The book drawer follows its book; global destinations close it and release the layout column.

const BOOK = 'b0000000-0000-4000-8000-000000000001';
const OTHER = 'b0000000-0000-4000-8000-000000000002';
const TASKS: BookTasksProjection = {
  bookId: BOOK, running: false,
  groups: (['waiting', 'running', 'recent'] as const).map((key) => ({ key, items: [], total: 0 })),
};

let uninstall: () => void;
beforeEach(() => {
  uninstall = installMiniDom();
  (globalThis as Record<string, unknown>)['window'] = { setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {} };
});
afterEach(() => {
  delete (globalThis as Record<string, unknown>)['window'];
  uninstall();
});

function harness() {
  const reads = { tasks: 0, plans: 0 };
  let selectedBook = BOOK;
  const root = miniDocument.createElement('aside');
  miniDocument.body.append(root);
  const api = {
    inspectTaskOverview: async () => ({ groups: ['running', 'queued', 'waiting', 'paused', 'recent'].map((key) => ({ key, items: [], total: 0 })), books: [{ bookId: selectedBook, title: '春江' }], capacity: 2, queueFrozen: false, runningCount: 0, queuedCount: 0, actionableCount: 0 }),
    inspectBookTasks: async () => { reads.tasks += 1; return { ...TASKS, bookId: selectedBook }; },
    inspectBaselineAnalysis: async () => { throw new Error('none'); },
    inspectTaskPlan: async () => { reads.plans += 1; throw new Error('none'); },
    inspectTaskIntentDrafts: async () => ({ bookId: selectedBook, bookTitle: '春江', manuscript: null, drafts: [] }),
  };
  const drawer: TaskDrawerSurface = mountTaskDrawer({
    resumeDraft: (bookId: string, resume: () => void) => { selectedBook = bookId; resume(); },
    root, shell: miniDocument.body, api, technicalDetails: () => miniDocument.createElement('div'),
    errorMessage: (_error: unknown, fallback: string) => fallback, errorCode: () => null, setStatus: vi.fn(), onOpen: vi.fn(), onRecorded: vi.fn(),
  } as unknown as MountTaskDrawerOptions);
  const find = (selector: string): MiniElement | null => root.querySelector(selector);
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  return { root, drawer, reads, find, settle, selectBook: (bookId: string) => { selectedBook = bookId; } };
}

describe('the 任务 panel as the right co-pilot', () => {
  it('stays the same panel beside every screen of its Book, reading each time', async () => {
    const { root, drawer, reads, find, settle } = harness();
    drawer.openPanel(BOOK, () => null);
    await settle();
    const panel = find('.task-panel');
    expect(panel?.dataset['taskPanel']).toBe('ready');
    for (const screen of ['editor', 'book-review', 'proposal-workspace', 'proposal-conflict', 'book-findings', 'book-deliverables', 'book-sources', 'agent-workspace']) {
      drawer.followScreen(screen, BOOK);
      await settle();
      expect(root.hidden).toBe(false);
      expect(find('.task-panel')).toBe(panel);
      expect(drawer.view()).toEqual({ kind: 'panel', bookId: BOOK });
    }
    expect(reads.tasks).toBe(9);
  });

  it('closes on 全域智能体, releases its column and stops book reads', async () => {
    const { root, drawer, reads, settle } = harness();
    drawer.openPanel(BOOK, () => null);
    await settle();
    drawer.followScreen('global-agent', null);
    drawer.refresh('baseline-analysis');
    await settle();
    expect(root.hidden).toBe(true);
    expect(miniDocument.body.dataset['taskDrawer']).toBe('closed');
    expect(drawer.view()).toBeNull();
    expect(reads.tasks).toBe(1);
    drawer.followScreen('editor', BOOK);
    expect(root.hidden).toBe(true);
    drawer.openPanel(BOOK, () => null);
    await settle();
    expect(root.hidden).toBe(false);
    expect(reads.tasks).toBe(2);
  });

  it('closes an open plan on global navigation and reads no more', async () => {
    const { root, drawer, reads, settle } = harness();
    drawer.open({ bookId: BOOK, kind: 'baseline-analysis', ref: null }, () => null);
    await settle();
    drawer.followScreen('proposal-workspace', BOOK);
    await settle();
    drawer.followScreen('global-agent', null);
    drawer.followScreen('editor', BOOK);
    await settle();
    expect(root.hidden).toBe(true);
    expect(drawer.view()).toBeNull();
    expect(reads.plans).toBe(2);
  });

  it('parks unsaved composer words when the global destination closes it', async () => {
    const { root, drawer, find, settle, selectBook } = harness();
    drawer.openComposer({ bookId: BOOK, bookTitle: '春江', origin: 'composer-book', manuscript: null, ranges: [] }, () => null);
    await settle();
    expect(find('.task-composer')?.tagName).toBe('SECTION');
    expect(find('.task-composer')?.classList.contains('sheet')).toBe(false);
    find('[data-task-composer-field="goal"]')!.value = '核对人物称谓';
    find('[data-task-composer-field="goal"]')!.dispatchEvent({ type: 'input' });
    drawer.followScreen('global-agent', null);
    expect(root.hidden).toBe(true);
    expect(drawer.view()).toBeNull();
    drawer.followScreen('editor', BOOK);
    expect(root.hidden).toBe(true);
    expect(find('[data-task-composer-field="goal"]')).toBeNull();
    selectBook(OTHER); drawer.openPanel(OTHER, () => null); await settle();
    find('[data-task-composer-action="resume"]')!.click();
    expect(find('[data-task-composer-field="goal"]')?.value).toBe('核对人物称谓');
  });
});

it('scans the Book task drawer in ordinary mode (#1315)', async () => {
  setTechnicalLayerVisible(false);
  try { const view = harness(); view.drawer.openPanel(BOOK, () => null); await view.settle(); expectNoTechnicalText(view.root); view.drawer.close(false); }
  finally { setTechnicalLayerVisible(true); }
});
