import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountParagraphAnalysis } from '../../src/renderer/paragraph-analysis.js';
import { installMiniDom } from '../support/mini-dom.js';
import type { ParagraphAnalysisProjection } from '../../src/shared/protocol.js';

let restore: () => void;
beforeEach(() => {
  restore = installMiniDom(); vi.useFakeTimers();
  vi.stubGlobal('window', {
    setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout,
    setInterval: globalThis.setInterval, clearInterval: globalThis.clearInterval,
  });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); restore(); });

const reading = (bookId: string): ParagraphAnalysisProjection => ({
  bookId, manuscriptId: 'manuscript', blockId: 'block', total: 1,
  items: [{ kind: 'entities', label: '合成人物', blockId: 'block' }],
  revision: { revisionId: 'analysis-2', ordinal: 2, freshness: {
    axis: 'freshness', state: 'stale', label: '稿件已变化，分析待更新', boundRevisionId: 'old', boundRevisionDigest: 'old-digest',
    currentRevisionId: 'current', currentWorkingDigest: 'current-digest', currentJournalSequence: 1, comparison: 'local-deterministic',
  } },
});

function mounted(bookId: string, notice = vi.fn(), viewed = vi.fn(async () => undefined)) {
  const root = document.createElement('aside'); root.id = 'paragraph-analysis-panel';
  const entry = document.createElement('button');
  document.body.append(root, entry);
  const read = vi.fn(async () => reading(bookId));
  const openItem = vi.fn();
  const panel = mountParagraphAnalysis({ bookId, root, entry, read, lastViewed: () => 1, viewed, notice, beforeOpen: vi.fn(), openItem });
  return { root, entry, read, openItem, notice, viewed, panel };
}

describe('mounted paragraph analysis', () => {
  it('shows one notice across closing and remounting, and writes viewed preference only after an actual panel read', async () => {
    const notice = vi.fn(); const viewed = vi.fn(async () => undefined);
    const first = mounted('once-book', notice, viewed);
    await vi.advanceTimersByTimeAsync(250);
    expect(notice).toHaveBeenCalledTimes(1); expect(viewed).not.toHaveBeenCalled();
    first.panel.refresh(); await vi.advanceTimersByTimeAsync(250);
    expect(notice).toHaveBeenCalledTimes(1); expect(viewed).not.toHaveBeenCalled();
    first.panel.destroy();
    const second = mounted('once-book', notice, viewed);
    await vi.advanceTimersByTimeAsync(250);
    expect(notice).toHaveBeenCalledTimes(1); expect(viewed).not.toHaveBeenCalled();
    second.panel.toggle(); await vi.advanceTimersByTimeAsync(250);
    expect(viewed).toHaveBeenCalledWith({ revisionId: 'analysis-2', ordinal: 2 });
    expect(second.root.textContent).toContain('稿件已变化，分析待更新');
    second.root.querySelector('button')!.click();
    expect(second.openItem).toHaveBeenCalledWith(reading('once-book').items[0], 'analysis-2');
    const viewedCalls = viewed.mock.calls.length;
    second.panel.close(); await vi.advanceTimersByTimeAsync(5_500);
    expect(viewed.mock.calls.length).toBe(viewedCalls); expect(notice).toHaveBeenCalledTimes(1);
    second.panel.destroy();
  });

  it('debounces paragraph changes and stops reads when its screen is destroyed', async () => {
    const mountedPanel = mounted('debounce-book');
    for (let index = 0; index < 20; index += 1) mountedPanel.panel.refresh();
    await vi.advanceTimersByTimeAsync(219); expect(mountedPanel.read).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2); expect(mountedPanel.read).toHaveBeenCalledTimes(1);
    mountedPanel.panel.refresh(); mountedPanel.panel.destroy();
    await vi.advanceTimersByTimeAsync(10_000); expect(mountedPanel.read).toHaveBeenCalledTimes(1);
  });
});
