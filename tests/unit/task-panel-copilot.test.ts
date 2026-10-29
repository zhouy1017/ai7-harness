import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookTasksProjection } from '../../src/shared/protocol.js';
import { installMiniDom, miniDocument, MiniElement } from '../support/mini-dom.js';
import { mountTaskDrawer, type MountTaskDrawerOptions, type TaskDrawerSurface } from '../../src/renderer/task-drawer.js';

// Unit (L1) suite for the right co-pilot (Issue #1178, F-10 outcome 1) on a minimal DOM: the drawer's one 任务 panel, plan or
// composer stays as it is beside every screen of its Book, is held beside 全域智能体 — its last read shown, nothing read, every
// control but 关闭 waiting, one line naming the Book — and clears only on another Book, a screen of no Book, or 关闭.

const BOOK = 'b0000000-0000-4000-8000-000000000001';
const OTHER = 'b0000000-0000-4000-8000-000000000002';
const TASKS: BookTasksProjection = {
  bookId: BOOK, running: false,
  groups: (['waiting', 'running', 'recent'] as const).map((key) => ({ key, items: [], total: 0 })),
};

let uninstall: () => void;
beforeEach(() => {
  uninstall = installMiniDom();
  (globalThis as Record<string, unknown>)['window'] = { setTimeout, clearTimeout };
});
afterEach(() => {
  delete (globalThis as Record<string, unknown>)['window'];
  uninstall();
});

function harness() {
  const reads = { tasks: 0, plans: 0 };
  const root = miniDocument.createElement('aside');
  miniDocument.body.append(root);
  const api = {
    inspectBookTasks: async () => { reads.tasks += 1; return TASKS; },
    inspectBaselineAnalysis: async () => { throw new Error('none'); },
    inspectTaskPlan: async () => { reads.plans += 1; throw new Error('none'); },
    inspectTaskIntentDrafts: async () => ({ bookId: BOOK, bookTitle: '春江', manuscript: null, drafts: [] }),
    getPreferences: async () => ({ values: { 'shell.recentBooks': [{ bookId: BOOK, title: '春江', section: 'manuscript' }], 'shell.pinnedBooks': [] } }),
  };
  const drawer: TaskDrawerSurface = mountTaskDrawer({
    root, shell: miniDocument.body, api, technicalDetails: () => miniDocument.createElement('div'),
    errorMessage: (_error: unknown, fallback: string) => fallback, errorCode: () => null, setStatus: vi.fn(), onOpen: vi.fn(), onRecorded: vi.fn(),
  } as unknown as MountTaskDrawerOptions);
  const find = (selector: string): MiniElement | null => root.querySelector(selector);
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const enabled = () => root.querySelectorAll('button, input, textarea, select').filter((node) => !node.disabled && !node.hidden)
    .map((node) => node.dataset['taskDrawerControl'] ?? node.dataset['taskComposeAction'] ?? node.tagName);
  return { root, drawer, reads, find, settle, enabled };
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

  it('is held beside 全域智能体: last read kept, nothing read, only 关闭 acts, one line naming the Book', async () => {
    const { root, drawer, reads, find, settle, enabled } = harness();
    drawer.openPanel(BOOK, () => null);
    await settle();
    const panel = find('.task-panel');
    drawer.followScreen('global-agent', null);
    await settle();
    expect(root.hidden).toBe(false);
    expect(find('.task-panel')).toBe(panel);
    expect(panel?.dataset['taskPanel']).toBe('ready');
    expect(find('[data-task-drawer-held]')?.hidden).toBe(false);
    expect(find('[data-task-drawer-held]')?.textContent).toBe('《春江》的任务 · 回到本书后继续');
    expect(enabled()).toEqual(['close']);
    drawer.refresh('baseline-analysis');
    expect(reads.tasks).toBe(1);
  });

  it('goes on where it was once its Book is on screen again', async () => {
    const { drawer, reads, find, settle, enabled } = harness();
    drawer.openPanel(BOOK, () => null);
    await settle();
    const before = enabled();
    drawer.followScreen('global-agent', null);
    drawer.followScreen('proposal-workspace', BOOK);
    await settle();
    expect(find('[data-task-drawer-held]')?.hidden).toBe(true);
    expect(enabled()).toEqual(before);
    expect(reads.tasks).toBe(2);
  });

  it('clears on another Book, on a screen of no Book, and on 关闭 beside 全域智能体', async () => {
    const { root, drawer, find, settle } = harness();
    drawer.openPanel(BOOK, () => null);
    drawer.followScreen('editor', OTHER);
    expect(root.hidden).toBe(true);
    drawer.openPanel(BOOK, () => null);
    drawer.followScreen('landing', null);
    expect(root.hidden).toBe(true);
    drawer.openPanel(BOOK, () => null);
    drawer.followScreen('global-agent', null);
    find('[data-task-drawer-control="close"]')!.click();
    expect(root.hidden).toBe(true);
    expect(find('[data-task-drawer-held]')?.hidden).toBe(true);
    drawer.followScreen('global-agent', null);
    await settle();
    expect(root.hidden).toBe(true);
  });

  it('keeps an open Task beside the proposal workspace and 全域智能体, reading it only beside its Book', async () => {
    const { root, drawer, reads, settle } = harness();
    drawer.open({ bookId: BOOK, kind: 'baseline-analysis', ref: null }, () => null);
    await settle();
    drawer.followScreen('proposal-workspace', BOOK);
    await settle();
    drawer.followScreen('global-agent', null);
    await settle();
    expect(root.dataset['taskPlanKind']).toBe('baseline-analysis');
    expect(drawer.view()).toEqual({ kind: 'plan', bookId: BOOK });
    expect(reads.plans).toBe(2);
    drawer.followScreen('editor', BOOK);
    await settle();
    expect(reads.plans).toBe(3);
  });

  it('keeps the composer\'s unsaved words beside 全域智能体, waiting, and gives them back', async () => {
    const { drawer, find, settle } = harness();
    drawer.openComposer({ bookId: BOOK, bookTitle: '春江', origin: 'composer-book', manuscript: null, ranges: [] }, () => null);
    await settle();
    const goal = find('[data-task-composer-field="goal"]')!;
    goal.value = '核对人物称谓';
    drawer.followScreen('proposal-workspace', BOOK);
    drawer.followScreen('global-agent', null);
    expect(find('[data-task-composer-field="goal"]')).toBe(goal);
    expect(goal.disabled).toBe(true);
    drawer.followScreen('editor', BOOK);
    expect(goal.disabled).toBe(false);
    expect(goal.value).toBe('核对人物称谓');
    expect(drawer.view()).toEqual({ kind: 'composer', bookId: BOOK });
  });
});
