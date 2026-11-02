import { expect, it, vi } from 'vitest';
import { observeSourceImages } from '../../src/renderer/editor-source.js';
import { installMiniDom } from '../support/mini-dom.js';

it('requests image chunks with only the pinned image fields when its binding is a full window', async () => {
  const restore = installMiniDom();
  vi.stubGlobal('MutationObserver', class { observe(): void {} disconnect(): void {} });
  const host = document.createElement('div');
  const image = document.createElement('img');
  image.dataset['sourceVersion'] = 'source-version';
  image.dataset['sourceImage'] = '2';
  host.append(image);
  const read = vi.fn(async () => ({ base64: 'AA==', totalBytes: 1, mime: 'image/png' }));
  const window = { manuscriptId: 'manuscript', branchId: 'branch', revisionId: 'revision', blocks: [] };
  const stop = observeSourceImages(host, read, () => window);
  try {
    await vi.waitFor(() => expect(read).toHaveBeenCalledOnce());
    expect(read).toHaveBeenCalledWith({ manuscriptId: 'manuscript', branchId: 'branch',
      sourceVersionId: 'source-version', ordinal: 2, offset: 0 });
    await vi.waitFor(() => expect(image.src).toMatch(/^blob:/));
  } finally {
    stop();
    vi.unstubAllGlobals();
    restore();
  }
});
