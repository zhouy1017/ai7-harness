import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createModelServiceSettings } from '../../src/renderer/model-service-settings.js';
import { createSettingsScreens } from '../../src/renderer/settings-screens.js';
import { setTechnicalLayerVisible } from '../../src/renderer/technical-layer.js';
import { installMiniDom, miniDocument, type MiniElement } from '../support/mini-dom.js';

let restore: () => void;
beforeEach(() => { restore = installMiniDom(); setTechnicalLayerVisible(false); });
afterEach(() => { vi.unstubAllGlobals(); setTechnicalLayerVisible(true); restore(); });

const element = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node;
};
const button = (label: string, className: string, action: () => void | Promise<void>): HTMLButtonElement => {
  const node = element('button', className, label); node.addEventListener('click', () => void action()); return node;
};

function mount(readFails: boolean) {
  const root = element('main'); miniDocument.body.append(root as never);
  const settings = createSettingsScreens({ setStatus: vi.fn(), panel: () => element('section'), element, button, replaceScreen: vi.fn(), api: {} as never,
    rendererErrorMessage: (_error, fallback) => fallback, screen: root, renderRunReport: vi.fn() as never, applyKeyboardBindings: vi.fn(), keyboardSettingsOff: undefined,
    renderModelServiceSettings: vi.fn(async () => undefined), renderDataAndStorage: vi.fn(async () => undefined), renderDiagnostics: vi.fn(),
    appearance: {} as never, viewPreferences: {} as never });
  vi.stubGlobal('window', { ai7: { getModelServiceSettings: async () => { throw new Error(readFails ? 'unreadable' : 'unused'); }, getPreferences: async () => ({ values: { 'model.favourites': [] } }) }, setInterval: () => 0, clearInterval: () => undefined });
  const modelService = createModelServiceSettings({ element, button, panel: () => element('section'), setStatus: vi.fn(), initializeStartup: vi.fn(),
    rendererErrorMessage: (_error, fallback) => fallback, replaceScreen: (state, content) => root.replaceChildren(settings.settingsLayout(state, content)) });
  return { root: root as unknown as MiniElement, modelService, settings };
}

it('draws 模型服务 with its navigation and the reason when 设置 cannot read it (#1522)', async () => {
  const { root, modelService } = mount(true);
  await modelService.renderModelServiceSettings();
  const current = root.querySelector('.settings-layout .settings-navigation [data-settings-nav="model-service"]')!;
  expect(current.getAttribute('aria-current')).toBe('page');
  expect(root.querySelector('.model-service-settings .attention-note')!.textContent).toBe('无法读取模型服务设置。');
  expect(root.querySelectorAll('.settings-navigation [data-settings-nav]').map((entry) => entry.dataset['settingsNav'])).toEqual(
    ['model-service', 'evaluation-calibration', 'data-storage', 'appearance', 'keyboard', 'notifications', 'help']);
  expect(root.querySelectorAll('.settings-navigation h3').map((heading) => heading.textContent)).toEqual(['服务', '编辑工作', '本机']);
  expect(root.querySelector('.settings-navigation')!.textContent).not.toContain('全部设置');
});

it('has no page of its own for 设置, lays a settings page with its navigation and leaves any other page alone', () => {
  const { settings } = mount(false);
  expect(Object.keys(settings.settingsPages())).not.toContain('settings');
  expect(settings.settingsLayout('help', element('section')).className).toBe('settings-layout');
  const other = element('section');
  expect(settings.settingsLayout('landing', other)).toBe(other);
});
