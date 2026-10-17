import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountHelp, type ThirdPartyLicense } from '../../src/renderer/help.js';
import { installMiniDom, miniDocument, MiniElement } from '../support/mini-dom.js';

// #939 slice 11f: drive the mounted 帮助 screen through its own data attributes — tab switching by click and by arrow
// key, the 关于 line, and the license filter — with the same minimal DOM the other renderer surfaces use.
let restore: () => void;
beforeEach(() => {
  restore = installMiniDom();
  vi.stubGlobal('document', { createElement: miniDocument.createElement });
});
afterEach(() => { vi.unstubAllGlobals(); restore(); });

const LICENSES: ReadonlyArray<ThirdPartyLicense> = [
  { name: 'alpha', version: '1.0.0', license: 'MIT', repository: 'https://example.invalid/alpha', homepage: null, licenseText: 'ALPHA TEXT', licenseTextDigest: 'a' },
  { name: 'beta', version: '2.0.0', license: 'ISC', repository: null, homepage: 'https://example.invalid/beta', licenseText: 'BETA TEXT', licenseTextDigest: 'b' },
  { name: 'gamma', version: '3.0.0', license: 'Apache-2.0', repository: null, homepage: null, licenseText: '文本未随包提供', licenseTextDigest: 'g' },
];

function mounted(back = vi.fn()) {
  const root = document.createElement('section');
  mountHelp({
    root,
    loadVersions: async () => ({ softwareVersion: '0.9.9', dataVersion: 83 }),
    back,
    licenses: LICENSES,
    protocolVersion: 152,
  });
  const find = (selector: string): MiniElement => root.querySelector(selector) as unknown as MiniElement;
  return { root, back, find };
}

function dispatch(node: MiniElement, key: string): void {
  node.dispatchEvent({ type: 'keydown', key });
}

describe('the mounted 帮助 screen', () => {
  it('shows the 关于 line from the same versions 数据与存储 reads, protocol included', async () => {
    const { root, find } = mounted();
    expect((root as unknown as MiniElement).dataset['helpReady']).toBe('true');
    await vi.waitFor(() => expect(find('.help-about-line').textContent).toBe('软件版本 0.9.9 · 数据版本 83 · 服务协议 152'));
  });

  it('starts on 使用帮助 and switches tabs by click and by the arrow keys', () => {
    const { root, find } = mounted();
    expect((root as unknown as MiniElement).dataset['helpTab']).toBe('usage');
    expect(find('[id="help-tab-usage"]').getAttribute('aria-selected')).toBe('true');
    expect(find('[id="help-panel-usage"]').hidden).toBe(false);
    expect(find('[id="help-panel-privacy"]').hidden).toBe(true);

    find('[id="help-tab-privacy"]').click();
    expect((root as unknown as MiniElement).dataset['helpTab']).toBe('privacy');
    expect(find('[id="help-panel-privacy"]').hidden).toBe(false);
    expect(find('[id="help-panel-usage"]').hidden).toBe(true);

    dispatch(find('[id="help-tab-privacy"]'), 'ArrowRight');
    expect((root as unknown as MiniElement).dataset['helpTab']).toBe('licenses');
    expect(find('[id="help-tab-licenses"]').getAttribute('aria-selected')).toBe('true');
    expect(find('[id="help-panel-licenses"]').hidden).toBe(false);
  });

  it('lists every generated license and filters by name with a live count', () => {
    const { root, find } = mounted();
    const items = (root.querySelectorAll('.help-license') as unknown as MiniElement[]);
    expect(items.map((item) => item.dataset['licenseName'])).toEqual(['alpha', 'beta', 'gamma']);
    expect(find('.help-license-count').textContent).toBe('3 / 3 个组件');

    const filter = find('[id="help-license-filter"]');
    filter.value = 'beta';
    filter.dispatchEvent({ type: 'input' });
    expect(items.map((item) => item.hidden)).toEqual([true, false, true]);
    expect(find('.help-license-count').textContent).toBe('1 / 3 个组件');
    expect(find('.help-license-empty').hidden).toBe(true);

    filter.value = 'nothing-matches';
    filter.dispatchEvent({ type: 'input' });
    expect(find('.help-license-empty').hidden).toBe(false);
  });

  it('returns through its back button', () => {
    const back = vi.fn();
    const { root } = mounted(back);
    const buttons = (root.querySelectorAll('button') as unknown as MiniElement[]);
    buttons.find((node) => node.textContent === '返回')!.click();
    expect(back).toHaveBeenCalledTimes(1);
  });
});
