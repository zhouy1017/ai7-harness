import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { modelServiceChannels } from '../../src/service/launch-policy.js';
import { searchBackendSettingsProjection } from '../../src/service/provider/search-backend-settings.js';
import type { ModelServiceSettingsProjection, RendererApi } from '../../src/shared/protocol.js';
import { preferenceDefaults } from '../../src/shared/preferences.js';
import { createModelServiceSettings } from '../../src/renderer/model-service-settings.js';
import { setTechnicalLayerVisible } from '../../src/renderer/technical-layer.js';
import { installMiniDom, type MiniElement } from '../support/mini-dom.js';
import { expectNoTechnicalText } from '../support/technical-layer-scan.js';

let restore: () => void;
beforeEach(() => { restore = installMiniDom(); setTechnicalLayerVisible(false); });
afterEach(() => { vi.unstubAllGlobals(); setTechnicalLayerVisible(true); restore(); });

function mount(timed = false) {
  // Public synthetic settings; all effects are stubbed and no provider is contacted.
  const settings = {
    channels: modelServiceChannels(), roles: [], routeChoice: { routes: [], unsupportedProviders: [] },
    searchBackends: searchBackendSettingsProjection(['search-tinyfish', 'search-deepseek', 'search-brave', 'search-parallel', 'search-bochaai'].map((backendId) => ({
      backendId, credentialReference: null, credentialOperationState: 'missing', selected: backendId === 'search-tinyfish', selectedAt: '2026-11-06T00:00:00.000Z',
    }))),
    proxy: { mode: 'direct' }, lastProxyProbe: null, protectedSecretStore: { label: '合成凭据库', availability: 'available' }, authorityStatement: '合成设置',
    launchPolicy: { operationalScope: 'ordinary-production', integrityState: 'verified', providerProcessing: { authorizedLiveTransmissionCount: 0, label: '本地' },
      externalExport: { label: '未授权' }, publicReleasePermission: { label: '未授权' } },
  } as unknown as ModelServiceSettingsProjection;
  const api = {
    getModelServiceSettings: vi.fn(async () => settings),
    getPreferences: vi.fn(async () => ({ version: 1 as const, values: preferenceDefaults(), notice: null })),
    saveModelServiceProxy: vi.fn(async (proxy: Parameters<RendererApi['saveModelServiceProxy']>[0]) => { settings.proxy = proxy; return settings; }),
    selectSearchBackend: vi.fn(async (input: Parameters<RendererApi['selectSearchBackend']>[0]) => {
      if (input.role === 'fallback') settings.searchBackends.fallbackBackendId = input.backendId;
      else {
        settings.searchBackends.selectedBackendId = input.backendId;
        if (input.alwaysUseSelectedBackend !== undefined) settings.searchBackends.alwaysUseSelectedBackend = input.alwaysUseSelectedBackend;
      }
      return settings;
    }),
  };
  let follow: () => void = () => undefined;
  vi.stubGlobal('window', { ai7: api, setInterval: (callback: () => void) => { follow = callback; return timed ? setInterval(callback, 2000) : 0; }, clearInterval: timed ? clearInterval : vi.fn() });
  const element = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] => {
    const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node;
  };
  const root = document.body;
  const page = createModelServiceSettings({ element, panel: () => element('section'), setStatus: vi.fn(), initializeStartup: vi.fn(), returnToOrigin: vi.fn(),
    button: (label, className, action) => { const node = element('button', className, label); node.addEventListener('click', () => void action()); return node; },
    rendererErrorMessage: (_error, fallback) => fallback, replaceScreen: (_state, content) => root.replaceChildren(content) });
  return { root: root as unknown as MiniElement, page, api, settings, poll: () => follow() };
}

it('retains details and summary focus on two changed polls and defers native select or proxy drafts (#1375)', async () => {
  vi.useFakeTimers();
  const { root, page, settings } = mount(true);
  try {
    setTechnicalLayerVisible(true);
    await page.renderModelServiceSettings();
    root.querySelector('.model-service-technical')!.open = true;
    root.querySelector('.model-service-technical summary')!.focus();
    for (let cycle = 0; cycle < 2; cycle++) {
      const previous = root.querySelector('.model-service-settings');
      const channel = settings.channels[0]!;
      Object.assign(channel, { models: channel.models.map((model) => ({ ...model, modelLabel: `${model.modelLabel} changed` })) });
      await vi.advanceTimersByTimeAsync(2000);
      expect(root.querySelector('.model-service-settings')).not.toBe(previous);
      expect(root.querySelector('.model-service-technical')!.open).toBe(true);
      expect(document.activeElement).toBe(root.querySelector('.model-service-technical summary'));
    }
    const select = root.querySelector('select[aria-label="网络代理方式"]')!; select.focus();
    const channel = settings.channels[0]!; Object.assign(channel, { models: [] });
    await vi.advanceTimersByTimeAsync(4000); expect(root.querySelector('select[aria-label="网络代理方式"]')).toBe(select);
    select.value = 'proxy'; select.dispatchEvent({ type: 'change', bubbles: true });
    const address = root.querySelector('input[aria-label="代理 URL"]')!; address.value = 'http://127.0.0.1:7890'; address.setSelectionRange(7, 10, 'backward'); address.focus();
    await vi.advanceTimersByTimeAsync(4000);
    expect(address.value).toBe('http://127.0.0.1:7890'); expect(address.selectionStart).toBe(7); expect(document.activeElement).toBe(address);
  } finally { vi.clearAllTimers(); vi.useRealTimers(); }
});

it('lands the review search-settings route on the visible, focused search heading in ordinary mode (#1370)', async () => {
  const { root, page } = mount();
  const scroll = vi.spyOn((document.body as unknown as MiniElement).constructor.prototype, 'scrollIntoView');
  await page.renderModelServiceSettings('search');
  const search = root.querySelector('[data-search-backends="true"]')!;
  const proxy = root.querySelector('[data-model-service-proxy]')!;
  expect(search.parentElement).toBe(proxy.parentElement);
  expect(root.querySelector('.model-service-proxy-options')).toBeNull();
  expect(search.querySelector('h3')!.dataset['developerOnly']).toBeUndefined();
  expect(document.activeElement).toBe(search.querySelector('h3'));
  expect(scroll).toHaveBeenCalledWith({ block: 'start' });
  expect(search.textContent).toContain('当前生效来源：暂不可用');
  expect(search.querySelectorAll('input').filter((node) => node.type === 'password')).toHaveLength(5);
  expectNoTechnicalText(search);
  scroll.mockRestore();
});

it('saves ordinary proxy configuration and restores it after navigating away and back (#1370)', async () => {
  const { root, page, api } = mount();
  await page.renderModelServiceSettings();
  const mode = root.querySelector('select[aria-label="网络代理方式"]')!;
  mode.value = 'proxy'; mode.dispatchEvent({ type: 'change' });
  const address = root.querySelector('input[aria-label="代理 URL"]')!;
  expect(address.disabled).toBe(false); address.value = 'http://127.0.0.1:7890';
  root.querySelector('.model-service-proxy-form')!.dispatchEvent({ type: 'submit' });
  await vi.waitFor(() => expect(api.saveModelServiceProxy).toHaveBeenCalledWith({ mode: 'proxy', protocol: 'http', hostPort: '127.0.0.1:7890', probeRoute: 'opencode-go' }));
  root.replaceChildren(); await page.renderModelServiceSettings();
  expect(root.querySelector('select[aria-label="网络代理方式"]')!.value).toBe('proxy');
  expect(root.querySelector('input[aria-label="代理 URL"]')!.value).toBe('http://127.0.0.1:7890');
});

it('discards an ordinary unsaved proxy draft after the polling scenario leaves and returns (#1394 J12)', async () => {
  vi.useFakeTimers(); const { root, page, settings, api } = mount(true);
  try {
    await page.renderModelServiceSettings();
    const mode = root.querySelector('select[aria-label="网络代理方式"]')!;
    mode.value = 'proxy'; mode.dispatchEvent({ type: 'change', bubbles: true });
    const address = root.querySelector('input[aria-label="代理 URL"]')!;
    address.value = 'http://127.0.0.1:1'; address.dispatchEvent({ type: 'input', bubbles: true }); address.focus(); address.setSelectionRange(7, 12, 'backward');
    for (let cycle = 0; cycle < 2; cycle++) {
      Object.assign(settings.channels[0]!, { models: [{ modelId: `synthetic-${cycle}`, modelLabel: `Synthetic ${cycle}` }] });
      await vi.advanceTimersByTimeAsync(2000);
      expect(root.querySelector('input[aria-label="代理 URL"]')).toBe(address);
      expect([address.value, address.selectionStart, address.selectionEnd]).toEqual(['http://127.0.0.1:1', 7, 12]);
    }
    root.querySelector('select[aria-label="渠道"]')!.dispatchEvent({ type: 'change', bubbles: true });
    expect(root.querySelector('input[aria-label="代理 URL"]')).toBe(address);
    expect(settings.proxy.mode).toBe('direct');
    root.replaceChildren(); await page.renderModelServiceSettings();
    expect(root.querySelector('select[aria-label="网络代理方式"]')!.value).toBe('direct');
    expect(root.querySelector('input[aria-label="代理 URL"]')!.value).toBe('');
    expect(api.saveModelServiceProxy).not.toHaveBeenCalled();
  } finally { vi.clearAllTimers(); vi.useRealTimers(); }
});

it('keeps the review search heading focused through two changed catalogue reads (#1370)', async () => {
  const { root, page, settings, poll } = mount();
  await page.renderModelServiceSettings('search');
  for (const suffix of ['second', 'third']) {
    const previous = root.querySelector('[data-search-backends] h3');
    const channel = settings.channels[0]!;
    Object.assign(channel, { models: channel.models.map((model) => ({ ...model, modelLabel: `${model.modelLabel} ${suffix}` })) });
    poll();
    await vi.waitFor(() => expect(root.querySelector('[data-search-backends] h3')).not.toBe(previous));
    expect(document.activeElement === root.querySelector('[data-search-backends] h3')).toBe(true);
  }
});

it('keeps the ordinary search-source choice across a settings round trip (#1370)', async () => {
  const { root, page, api } = mount();
  await page.renderModelServiceSettings();
  const override = root.querySelector('[data-action="always-use-selected-search-backend"]')!;
  override.checked = true; override.dispatchEvent({ type: 'change' });
  await vi.waitFor(() => expect(api.selectSearchBackend).toHaveBeenCalledWith({ backendId: 'search-tinyfish', alwaysUseSelectedBackend: true }));
  root.replaceChildren(); await page.renderModelServiceSettings();
  expect(root.querySelector('[data-action="always-use-selected-search-backend"]')!.checked).toBe(true);
});

it('a model-list refresh that lands after the editor left never brings 模型服务 back; its catalogue shows on return (#1445)', async () => {
  const { root, page, api, settings } = mount();
  Object.assign(settings.routeChoice, { routes: [{ route: 'opencode-go', inUse: true, status: 'ready', statusLabel: '可用',
    connection: { connectionName: '合成连接', credentialOperationState: 'ready', connectionTest: null } }] });
  let land: (next: ModelServiceSettingsProjection) => void = () => undefined;
  const refreshModelServiceModels = vi.fn(() => new Promise<ModelServiceSettingsProjection>((resolve) => { land = resolve; }));
  Object.assign(api, { refreshModelServiceModels });
  await page.renderModelServiceSettings();
  const refresh = root.querySelector('[data-action="retry-model-list"]')!;
  expect(refresh.disabled).toBe(false);
  refresh.click();
  expect(refreshModelServiceModels).toHaveBeenCalledWith({ route: 'opencode-go' });
  const elsewhere = document.createElement('section') as unknown as MiniElement;
  root.replaceChildren(elsewhere);
  // The service keeps the refreshed catalogue; the late answer arrives after the editor went elsewhere.
  const modelId = settings.channels.find((channel) => channel.channelId === 'opencode-go')!.models[0]!.modelId;
  settings.channels = modelServiceChannels((route) => route === 'opencode-go' ? [{ modelId, modelLabel: '刷新后的合成模型' }] : []);
  land({ ...settings, modelDiscovery: { status: 'success', modelCount: 1 } } as ModelServiceSettingsProjection);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(root.children.length === 1 && root.children[0] === elsewhere).toBe(true);
  expect(root.querySelector('.model-service-settings')).toBeNull();
  await page.renderModelServiceSettings();
  expect(root.querySelector('.model-service-settings')!.textContent).toContain('刷新后的合成模型');
});
