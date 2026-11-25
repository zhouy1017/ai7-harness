import { initializeTechnicalLayer, resetTechnicalLayer, setTechnicalLayerVisible } from '../../src/renderer/technical-layer.js';
import { expectNoTechnicalText } from '../support/technical-layer-scan.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { developerModeRow, mountHelp, THIRD_PARTY_LICENSES, type HelpCommands, type ThirdPartyLicense } from '../../src/renderer/help.js';
import { installMiniDom, miniDocument, MiniElement } from '../support/mini-dom.js';
import { SERVICE_PROTOCOL_VERSION } from '../../src/shared/protocol.js';
import { HELP_ABOUT_FAILED } from '../../src/renderer/help-labels.js';
import { helpUsageSections } from '../../src/renderer/help-text.js';

// #939 slice 11f: drive the mounted 帮助 screen through its own data attributes — tab switching by click and by arrow
// key, the 关于 line, and the license filter — with the same minimal DOM the other renderer surfaces use.
let restore: () => void;
beforeEach(() => {
  restore = installMiniDom();
  vi.stubGlobal('document', { createElement: miniDocument.createElement });
  vi.stubGlobal('__AI7_BUILD_IDENTITY__', { schema: 1, softwareVersion: '0.9.9', dataVersion: 1,
    buildNumber: 1234, sourceCommit: 'a'.repeat(40), dirty: true });
});
afterEach(() => { vi.unstubAllGlobals(); restore(); });

const LICENSES: ReadonlyArray<ThirdPartyLicense> = [
  { name: 'alpha', version: '1.0.0', license: 'MIT', repository: 'https://example.invalid/alpha', homepage: null, licenseText: 'ALPHA TEXT', licenseTextDigest: 'a' },
  { name: 'beta', version: '2.0.0', license: 'ISC', repository: null, homepage: 'https://example.invalid/beta', licenseText: 'BETA TEXT', licenseTextDigest: 'b' },
  { name: 'gamma', version: '3.0.0', license: 'Apache-2.0', repository: null, homepage: null, licenseText: '文本未随包提供', licenseTextDigest: 'g' },
];

function mounted(commands?: HelpCommands) {
  const root = document.createElement('section');
  mountHelp({
    root,
    ...(commands === undefined ? {} : { commands }),
    loadVersions: async () => ({ softwareVersion: '0.9.9', dataVersion: 1, frozen: true }),
    licenses: LICENSES,
  });
  const find = (selector: string): MiniElement => root.querySelector(selector) as unknown as MiniElement;
  return { root, find };
}

function dispatch(node: MiniElement, key: string): void {
  node.dispatchEvent({ type: 'keydown', key });
}

describe('the mounted 帮助 screen', () => {
  it('describes only the pages available in the selected mode', () => {
    const ordinary = helpUsageSections(false).map((section) => section.paragraphs.join(''));
    const developer = helpUsageSections(true).map((section) => section.paragraphs.join(''));
    expect(ordinary.join('')).toContain('审阅规范文件、字表与词表、审阅偏好、范例、资料库、本社词表');
    expect(ordinary.join('')).toContain('审阅偏好、反馈记录、学习回溯');
    expect(ordinary.join('')).not.toContain('诊断');
    expect(ordinary.join('')).not.toContain('检索排除');
    expect(developer.join('')).toContain('外部来源留存');
    expect(developer.join('')).toContain('学习回溯');
    expect(developer.join('')).toContain('检索排除');
  });

  it('shows the 关于 line from the same versions 数据与存储 reads, protocol included', async () => {
    const { root, find } = mounted();
    expect((root as unknown as MiniElement).dataset['helpReady']).toBe('true');
    await vi.waitFor(() => expect(find('.help-about-line').textContent).toBe(`软件版本 0.9.9 · 数据版本 1 · 服务协议 ${SERVICE_PROTOCOL_VERSION}`));
    // The frozen Data Version in 设置 › 数据与存储's own words (Issue #967).
    expect(find('.help-data-version-state').textContent).toBe('数据版本 1 已冻结。');
    expect(find('.help-build-identity').textContent).toBe(`构建 1234 · 源码 ${'a'.repeat(40)} · 本地修改（未提交）`);
  });

  it('refuses to combine identity with mismatched service software or data versions', async () => {
    vi.stubGlobal('__AI7_BUILD_IDENTITY__', { schema: 1, softwareVersion: '0.9.8', dataVersion: 1,
      buildNumber: 1234, sourceCommit: 'a'.repeat(40), dirty: false });
    const { find } = mounted();
    await vi.waitFor(() => expect(find('.help-about-line').textContent).toBe(HELP_ABOUT_FAILED));
    expect(find('.help-build-identity').textContent).toBe('');
  });

  it('starts on 使用帮助 and switches tabs by click and by the arrow keys', () => {
    const { root, find } = mounted();
    expect((root as unknown as MiniElement).dataset['helpTab']).toBe('usage');
    expect(find('[id="help-tab-usage"]').getAttribute('aria-selected')).toBe('true');
    expect(find('[id="help-panel-usage"]').hidden).toBe(false);
    expect(find('[id="help-panel-usage"]').tabIndex).toBe(0);
    expect(find('[id="help-panel-privacy"]').hidden).toBe(true);

    find('[id="help-tab-privacy"]').click();
    expect((root as unknown as MiniElement).dataset['helpTab']).toBe('privacy');
    expect(find('[id="help-panel-privacy"]').hidden).toBe(false);
    expect(find('[id="help-panel-usage"]').hidden).toBe(true);

    dispatch(find('[id="help-tab-privacy"]'), 'ArrowRight');
    expect((root as unknown as MiniElement).dataset['helpTab']).toBe('licenses');
    expect(find('[id="help-tab-licenses"]').getAttribute('aria-selected')).toBe('true');
    expect(find('[id="help-panel-licenses"]').hidden).toBe(false);
    dispatch(find('[id="help-tab-licenses"]'), 'ArrowRight');
    expect((root as unknown as MiniElement).dataset['helpTab']).toBe('usage');
    dispatch(find('[id="help-tab-usage"]'), 'End');
    expect((root as unknown as MiniElement).dataset['helpTab']).toBe('licenses');
    dispatch(find('[id="help-tab-licenses"]'), 'Home');
    expect((root as unknown as MiniElement).dataset['helpTab']).toBe('usage');
    // Alt+← is 返回, not the tab row's arrow: the focused tab leaves it for the command (0.7.9 review, BUG-18).
    const chord = { type: 'keydown', key: 'ArrowLeft', altKey: true };
    expect(find('[id="help-tab-usage"]').dispatchEvent(chord)).toBe(true);
    expect((root as unknown as MiniElement).dataset['helpTab']).toBe('usage');
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
});

describe('第一次审稿 (#1548)', () => {
  const stepNodes = (root: MiniElement): MiniElement[] => root.querySelectorAll('[data-help-step]') as unknown as MiniElement[];

  it('puts 第一次审稿 first, with a button on each step that runs its command', () => {
    const run = vi.fn();
    const { root } = mounted({ run, usable: () => true });
    const first = root.querySelector('.help-section') as unknown as MiniElement;
    expect(first.dataset['helpSection']).toBe('first-review');
    expect(stepNodes(root as unknown as MiniElement).map((node) => node.dataset['helpStep'])).toEqual(['model', 'import', 'review', 'process', 'export']);
    for (const node of stepNodes(root as unknown as MiniElement)) (node.querySelector('button') as unknown as MiniElement).click();
    expect(run.mock.calls.map((call) => call[0])).toEqual(['nav.settings', 'nav.library', 'review.new', 'nav.book.findings', 'nav.book.deliverables']);
  });

  it('says a Book is needed, in place of a button, on the steps that act inside one', () => {
    const run = vi.fn();
    const { root } = mounted({ run, usable: (command) => command === 'nav.settings' || command === 'nav.library' });
    const nodes = stepNodes(root as unknown as MiniElement);
    expect(nodes.map((node) => node.querySelector('button') !== null)).toEqual([true, true, false, false, false]);
    expect(nodes.slice(2).map((node) => node.querySelector('[data-help-step-needs-book]')?.textContent)).toEqual(Array(3).fill('需要先打开一本图书：在书库里打开后，回到这里继续。'));
    expect(run).not.toHaveBeenCalled();
  });
});

it('scans Help in ordinary mode (#1315)', async () => {
  setTechnicalLayerVisible(false);
  try { const view = mounted(); await Promise.resolve(); expectNoTechnicalText(view.root); }
  finally { setTechnicalLayerVisible(true); }
});

it('applies developer mode immediately and persists the choice (#1315)', () => {
  initializeTechnicalLayer('source-checkout', { getItem: () => null });
  const storage = { setItem: vi.fn() };
  vi.stubGlobal('window', { localStorage: storage, location: { reload: vi.fn() } });
  const view = mounted();
  const toggle = view.find('.help-developer-mode input');
  toggle.checked = false; toggle.dispatchEvent({ type: 'change' });
  try {
    expect(storage.setItem).toHaveBeenCalledWith('ai7.technicalLayerVisible', 'false');
    expect(view.root.querySelector('.help-about') === null).toBe(true);
    expect(view.root.querySelector<HTMLInputElement>('.help-developer-mode input')?.checked).toBe(false);
  } finally { setTechnicalLayerVisible(true); }
});

it('keeps early Help closed and its switch unavailable until initialization succeeds', () => {
  resetTechnicalLayer();
  try {
    const early = mounted();
    expect(early.find('.help-developer-mode input').disabled).toBe(true);
    expect(early.root.querySelector('.help-about')).toBeNull();
    expect(() => initializeTechnicalLayer('source-checkout', { getItem: () => { throw new Error('read failed'); } })).toThrow('read failed');
    const failed = mounted();
    expect(failed.find('.help-developer-mode input').disabled).toBe(true);
    expect(failed.root.querySelector('.help-about')).toBeNull();
  } finally { initializeTechnicalLayer('source-checkout', { getItem: () => null }); }
});

it('shares the immediate persisted switch with Settings Local and ignores changes before readiness', () => {
  const storage = { setItem: vi.fn() }, refresh = vi.fn();
  vi.stubGlobal('window', { localStorage: storage });
  resetTechnicalLayer();
  let row = developerModeRow(refresh);
  let toggle = row.querySelector<HTMLInputElement>('input')!;
  toggle.checked = true; (toggle as unknown as MiniElement).dispatchEvent({ type: 'change' });
  expect(storage.setItem).not.toHaveBeenCalled(); expect(refresh).not.toHaveBeenCalled();
  initializeTechnicalLayer('packaged', { getItem: () => null });
  row = developerModeRow(refresh); toggle = row.querySelector<HTMLInputElement>('input')!;
  expect(toggle.disabled).toBe(false); expect(toggle.checked).toBe(false);
  toggle.checked = true; (toggle as unknown as MiniElement).dispatchEvent({ type: 'change' });
  expect(storage.setItem).toHaveBeenCalledWith('ai7.technicalLayerVisible', 'true');
  expect(refresh).toHaveBeenCalledOnce();
});

it('scans the shipped Help and licence catalogue in ordinary mode (#1315)', () => {
  setTechnicalLayerVisible(false);
  try {
    const root = document.createElement('section');
    mountHelp({ root, loadVersions: async () => ({ softwareVersion: '0.9.9', dataVersion: 1, frozen: true }) });
    const entries = Array.from(root.querySelectorAll('.help-license'));
    expect(entries).toHaveLength(THIRD_PARTY_LICENSES.length);
    for (const [index, license] of THIRD_PARTY_LICENSES.entries()) {
      expect(entries[index]!.querySelector('.help-license-name')!.textContent).toBe(license.name);
      expect(entries[index]!.querySelector('.help-license-text')!.textContent).toBe(license.licenseText);
    }
    expectNoTechnicalText(root, [root.querySelector('.help-license-list')!]);
  } finally { setTechnicalLayerVisible(true); }
});
