import { expect, it, vi } from 'vitest';
import { createCommandPalette } from '../../src/renderer/command-palette.js';
import { installMiniDom, miniDocument } from '../support/mini-dom.js';

it('settles visible editing before a palette task starts, and respects a refused settlement', async () => {
  const restore = installMiniDom();
  const start = vi.fn(async () => ({ results: [] }));
  let release!: (allowed: boolean) => void;
  const settle = vi.fn(() => new Promise<boolean>((resolve) => { release = resolve; }));
  const api = { listBooks: async () => ({ items: [{ bookId: 'book-one', title: 'sample1', manuscriptState: 'populated' }], nextCursor: null }),
    inspectTaskOverview: async () => ({ groups: [], quickStarts: [] }), startQuickTasks: start } as unknown as Parameters<typeof createCommandPalette>[0]['api'];
  try {
    const help = vi.fn();
    const palette = createCommandPalette({ api, beforeStart: settle, execute: vi.fn(), openBook: vi.fn(), openResult: vi.fn(), openStart: vi.fn(), openHelp: help, status: vi.fn() });
    const choose = (): void => { miniDocument.body.querySelectorAll('button').find((node) => node.textContent === '发起任务 · sample1 · 基线分析')!.click(); };
    await palette.open(); choose();
    expect(settle).toHaveBeenCalledOnce(); expect(start).not.toHaveBeenCalled();
    release(false); await new Promise((resolve) => setTimeout(resolve, 0));
    expect(start).not.toHaveBeenCalled();
    await palette.open(); choose(); release(true);
    await vi.waitFor(() => expect(start).toHaveBeenCalledWith({ tasks: [{ bookId: 'book-one', procedureId: 'baseline-analysis' }] }));
    await palette.open();
    miniDocument.body.querySelectorAll('button').find((node) => node.textContent === '设置 · 帮助')!.click();
    expect(help).toHaveBeenCalledOnce();
  } finally { restore(); }
});
