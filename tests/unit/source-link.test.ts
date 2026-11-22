import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sourceDomain, sourceLinkControls, webSourceName, type SourceLinkApi } from '../../src/renderer/source-link.js';
import { installMiniDom, miniDocument, MiniElement } from '../support/mini-dom.js';

// Issue #1683 (item 12.1): a web source's domain, 复制链接 and 在浏览器中打开, against the one address rule main enforces.
// Synthetic public addresses only; the opener is a stub, so nothing is opened.

const BOOK = '00000000-0000-4000-8000-000000000001';
const IDENTITY = { bookId: BOOK, resultId: '00000000-0000-4000-8000-000000000002', cardId: 'src_1' };
const flush = async (): Promise<void> => { for (let count = 0; count < 10; count += 1) await Promise.resolve(); };
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; }

let restore: () => void;
let copied: string[];
beforeEach(() => {
  restore = installMiniDom();
  copied = [];
  // The document's copy command copies the carrier field's text, as the window's would.
  Object.assign(miniDocument, { execCommand: () => { copied.push((miniDocument.activeElement as MiniElement).value); return true; } });
  Object.defineProperty(MiniElement.prototype, 'select', { configurable: true, value: () => undefined });
});
afterEach(() => { Reflect.deleteProperty(MiniElement.prototype, 'select'); Reflect.deleteProperty(miniDocument, 'execCommand'); restore(); });

function api(open = vi.fn<SourceLinkApi['openSourceInBrowser']>(async () => ({ host: 'example.org' }))) {
  return { openSourceInBrowser: open, runEditorClipboardCommand: vi.fn(async () => ({ state: 'done' as const })) };
}
const mount = (address: string, identity: Parameters<typeof sourceLinkControls>[0]['identity'] = IDENTITY, stub = api()) => {
  const node = sourceLinkControls({ address, identity, api: stub }) as unknown as MiniElement;
  miniDocument.body.append(node);
  return { node, stub, open: () => node.querySelector('[data-source-action="open-in-browser"]'), status: () => node.querySelector('.source-link-status')!.textContent };
};

describe('a web source’s address controls', () => {
  it('names the domain the address check answers, and never the raw address', () => {
    expect(sourceDomain('https://Example.org:8443/a?b=1')).toBe('example.org:8443');
    expect(sourceDomain('https://user:pw@example.org/a')).toBe('example.org');
    expect(sourceDomain('ftp://files.example.org/a')).toBe('files.example.org');
    expect(sourceDomain('not an address')).toBeNull();
    expect(webSourceName(null, 'https://example.org/a')).toBe('example.org');
    expect(webSourceName('https://example.org/a', 'https://example.org/a')).toBe('example.org');
    expect(webSourceName(' 馆藏说明 ', 'https://example.org/a')).toBe('馆藏说明');
    expect(webSourceName(null, 'not an address')).toBe('网页来源');
  });

  it('offers 在浏览器中打开 with the check’s host and sends only the identity', async () => {
    const view = mount('https://example.org/vessel');
    expect(view.node.querySelector('.source-link-domain')!.textContent).toBe('example.org');
    expect(view.open()!.textContent).toBe('在浏览器中打开 · example.org');
    view.open()!.click(); await flush();
    expect(view.stub.openSourceInBrowser.mock.calls).toEqual([[IDENTITY]]);
    expect(view.status()).toBe('已在浏览器中打开。');
    const evidence = mount('https://example.org/vessel', { bookId: BOOK, evidenceId: '00000000-0000-4000-8000-0000000000e1' });
    evidence.open()!.click(); await flush();
    expect(evidence.stub.openSourceInBrowser.mock.calls).toEqual([[{ bookId: BOOK, evidenceId: '00000000-0000-4000-8000-0000000000e1' }]]);
  });

  it('shows a refused address’s sentence in place of the control and keeps 复制链接', () => {
    const view = mount('https://user:pw@example.org/a');
    expect(view.open()).toBeNull();
    expect(view.node.querySelector('.source-link-refusal')!.textContent).toBe('这个地址带有登录信息，不在浏览器中打开。');
    expect(view.node.querySelector('[data-source-action="copy-link"]')).not.toBeNull();
    expect(mount('https://example.org/a', null).open()).toBeNull();
  });

  it('is disabled while a press is in flight, sends one call for two clicks, and shows a refusal as it is', async () => {
    const answer = deferred<{ host: string }>();
    const view = mount('https://example.org/vessel', IDENTITY, api(vi.fn(() => answer.promise)));
    view.open()!.click(); view.open()!.click();
    expect(view.open()!.disabled).toBe(true);
    // A control drawn again while the press runs joins it rather than sending another.
    const redrawn = mount('https://example.org/vessel', IDENTITY, view.stub);
    expect(redrawn.open()!.disabled).toBe(true);
    redrawn.open()!.click();
    expect(view.stub.openSourceInBrowser).toHaveBeenCalledOnce();
    answer.reject(Object.assign(new Error('refused'), { code: 'AI7_SOURCE_OPEN_FAILED', message: '系统浏览器没有打开这个地址，可以复制链接后自己打开。' })); await flush();
    expect([view.status(), redrawn.status()]).toEqual(['系统浏览器没有打开这个地址，可以复制链接后自己打开。', '系统浏览器没有打开这个地址，可以复制链接后自己打开。']);
    expect(view.open()!.disabled).toBe(false);
    view.open()!.click(); await flush();
    expect(view.stub.openSourceInBrowser).toHaveBeenCalledTimes(2);
  });

  it('paints nothing for an answer that arrives after the control was removed', async () => {
    const answer = deferred<{ host: string }>();
    const view = mount('https://example.org/vessel', IDENTITY, api(vi.fn(() => answer.promise)));
    view.open()!.click();
    view.node.remove();
    answer.resolve({ host: 'example.org' }); await flush();
    expect(view.status()).toBe('');
    expect(view.open()!.disabled).toBe(true);
  });

  it('copies exactly the recorded address', async () => {
    const address = 'https://example.org/vessel?id=%E4%B8%80#part';
    const view = mount(address);
    view.node.querySelector('[data-source-action="copy-link"]')!.click(); await flush();
    expect(copied).toEqual([address]);
    expect(view.status()).toBe('已复制链接。');
    expect(view.stub.runEditorClipboardCommand).not.toHaveBeenCalled();
  });
});
