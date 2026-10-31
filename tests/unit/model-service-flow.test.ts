import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { modelServiceChannels } from '../../src/service/launch-policy.js';
import { MODEL_SERVICE_ROUTES, MODEL_SERVICE_ROUTE_BINDINGS, type ModelServiceRouteId, type ModelServiceSettingsProjection } from '../../src/shared/protocol.js';
import { USE_FOR_BOTH_ROLES_LABEL, modelRolesLabel, modelServiceFlow, type ModelServiceFlowApi } from '../../src/renderer/model-service-flow.js';
import { compactModelSelectionLabel, compactModelSelector } from '../../src/renderer/shell.js';
import { createModelServiceSettings } from '../../src/renderer/model-service-settings.js';
import { installMiniDom, type MiniElement } from '../support/mini-dom.js';

// 设置 › 模型服务's one flow and the header's compact selector (Issue #1215), over the real generated channel catalogue and a
// synthetic settings projection: no credential value exists anywhere in it, and every API call is a stub.
let restore: () => void;
beforeEach(() => { restore = installMiniDom(); });
afterEach(() => restore());

function settings(ready: ReadonlyArray<ModelServiceRouteId>, inUse: ModelServiceRouteId | null = ready[0] ?? null, fast: ModelServiceRouteId | null = inUse): ModelServiceSettingsProjection {
  const connection = (route: ModelServiceRouteId) => ({ connectionName: `合成连接 ${route}`, credentialOperationState: 'ready', connectionTest: null, binding: MODEL_SERVICE_ROUTE_BINDINGS[route] });
  const role = (roleId: string, route: ModelServiceRouteId | null) => ({ roleId, statusLabel: route === null ? '需设置' : '可用', binding: route === null ? null : MODEL_SERVICE_ROUTE_BINDINGS[route] });
  return {
    channels: modelServiceChannels(),
    roles: [role('fast-interaction', fast), role('main-editorial', inUse ?? 'opencode-go')],
    routeChoice: { routes: MODEL_SERVICE_ROUTES.map((route) => ({ route, inUse: route === inUse, statusLabel: ready.includes(route) ? '可用' : '需设置', connection: ready.includes(route) ? connection(route) : null })) },
  } as unknown as ModelServiceSettingsProjection;
}

function api(answer = settings(['opencode-go'])): ModelServiceFlowApi & { getModelServiceSettings: () => Promise<ModelServiceSettingsProjection> } {
  return {
    saveModelServiceCredential: vi.fn(async () => answer),
    selectFastRoleModel: vi.fn(async () => answer),
    testModelServiceConnection: vi.fn(async () => answer),
    getModelServiceSettings: vi.fn(async () => answer),
  };
}

function flow(projection: ModelServiceSettingsProjection, calls = api()) {
  const render = vi.fn();
  const node = modelServiceFlow(projection, { api: calls, render, setStatus: vi.fn(), errorMessage: (_error, fallback) => fallback, channel: null, chooseChannel: vi.fn() }) as unknown as MiniElement;
  return { node, render, calls };
}

const button = (root: MiniElement, action: string) => root.querySelector(`button[data-action="${action}"]`)!;
const pickChannel = (root: MiniElement, channelId: string) => {
  const radio = root.querySelector(`[data-model-channel="${channelId}"] input`)!;
  radio.checked = true;
  radio.dispatchEvent({ type: 'change', bubbles: true });
};

describe('the one model-service flow', () => {
  it('keeps the chosen channel through a settings repaint and resets it when the shell reopens the screen', async () => {
    const projection = { ...settings([], null), roles: [],
      routeChoice: { ...settings([], null).routeChoice, unsupportedProviders: [] },
      proxy: { mode: 'direct' }, searchBackends: { backends: [], candidates: [] },
      protectedSecretStore: { label: '合成凭据库', availability: 'available' }, authorityStatement: '合成设置',
      launchPolicy: { integrityState: 'verified', providerProcessing: { authorizedLiveTransmissionCount: 0, label: '本地' },
        externalExport: { label: '未授权' }, publicReleasePermission: { label: '未授权' } },
    } as unknown as ModelServiceSettingsProjection;
    const calls = { getModelServiceSettings: vi.fn(async () => projection), saveModelServiceProxy: vi.fn(async () => projection) };
    vi.stubGlobal('window', { ai7: calls });
    try {
      const element = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] => {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
      };
      const root = element('main');
      const setStatus = vi.fn();
      const initializeStartup = vi.fn(async () => undefined);
      const screen = createModelServiceSettings({ element, panel: () => element('section'), setStatus, initializeStartup,
        button: (label, className, action) => {
          const node = element('button', className, label); node.addEventListener('click', () => void action()); return node;
        },
        rendererErrorMessage: (_error, fallback) => fallback,
        replaceScreen: (_state, content) => root.replaceChildren(content),
      });
      await screen.renderModelServiceSettings();
      const page = root as unknown as MiniElement;
      pickChannel(page, 'anthropic-claude');
      page.querySelector('[data-model-service-proxy] form')!.dispatchEvent({ type: 'submit' });
      await vi.waitFor(() => expect(calls.saveModelServiceProxy).toHaveBeenCalledWith({ mode: 'direct' }));
      expect(page.querySelector('[data-model-service-flow]')!.dataset['flowChannel']).toBe('anthropic-claude');
      await screen.renderModelServiceSettings();
      expect(page.querySelector('[data-model-service-flow]')!.dataset['flowChannel']).toBe('opencode-go');
      expect(setStatus).toHaveBeenLastCalledWith('模型服务设置已打开');
      page.querySelectorAll('button').find((node) => node.textContent === '返回')!.click();
      expect(initializeStartup).toHaveBeenCalledOnce();
    } finally { vi.unstubAllGlobals(); }
  });

  it('lists the six channels and offers the in-use channel\'s model to both roles only once its credential is ready', () => {
    const fresh = flow(settings([], null)).node;
    expect(fresh.querySelectorAll('[data-model-channel]').map((label) => label.dataset['modelChannel'])).toEqual(
      ['opencode-zen', 'opencode-go', 'anthropic-claude', 'google-gemini', 'openai-platform', 'deepseek-open-platform']);
    expect(fresh.dataset['flowChannel']).toBe('opencode-go');
    expect(fresh.querySelector('[data-model-choice="deepseek-v4.1-flash"]')!.disabled).toBe(true);
    expect(button(fresh, 'use-model-for-both-roles').disabled).toBe(true);
    const ready = flow(settings(['deepseek-open-platform'])).node;
    expect(ready.dataset['flowChannel']).toBe('deepseek-open-platform');
    expect(ready.querySelector('[data-model-choice="deepseek-flash"]')!.checked).toBe(true);
  });

  it('shows a channel without a credential slot with every model and its disposition by name, and nothing to choose', () => {
    const { node } = flow(settings(['opencode-go']));
    pickChannel(node, 'anthropic-claude');
    expect(node.dataset['flowChannel']).toBe('anthropic-claude');
    expect(node.querySelectorAll('[data-model-choice]')).toHaveLength(0);
    expect(node.querySelector('button[data-action="enter-channel-credential"]')).toBeNull();
    const listed = node.querySelectorAll('.model-service-flow-ineligible li');
    expect(listed.length).toBe(modelServiceChannels().find((channel) => channel.channelId === 'anthropic-claude')!.models.length);
    expect(listed.every((item) => item.textContent.includes('untested:text') && item.querySelectorAll('input,button').length === 0)).toBe(true);
  });

  it('says a Fast-only model\'s Main disposition, and offers OpenAI to both roles now Main records it (#1225)', () => {
    const luna = modelServiceChannels().find((channel) => channel.channelId === 'openai-platform')!.models.find((model) => model.modelId === 'gpt-5.6-luna')!;
    expect([luna.main, luna.fast]).toEqual(['eligible', 'eligible']);
    expect(modelRolesLabel({ ...luna, main: 'not-in-runtime-model-table' })).toBe('主编辑角色：尚无已审核的运行配置（not-in-runtime-model-table）；快速交互角色：可在高级设置中单独指定');
    const { node } = flow(settings(['opencode-go', 'openai-platform']));
    pickChannel(node, 'openai-platform');
    expect(Array.from(node.querySelectorAll('[data-model-choice]'), (choice) => choice.dataset['modelChoice'])).toEqual(['gpt-5.6-sol', 'gpt-5.6-luna']);
  });

  it('sets both roles through the existing route and Fast choices, and renders the settings that answer', async () => {
    const answer = settings(['opencode-go', 'deepseek-open-platform'], 'deepseek-open-platform');
    const { node, render, calls } = flow(settings(['opencode-go', 'deepseek-open-platform'], 'opencode-go'), api(answer));
    pickChannel(node, 'deepseek-open-platform');
    const use = button(node, 'use-model-for-both-roles');
    expect([use.disabled, use.textContent]).toEqual([false, USE_FOR_BOTH_ROLES_LABEL]);
    use.click();
    await vi.waitFor(() => expect(render).toHaveBeenCalledWith(answer));
    expect(calls.saveModelServiceCredential).toHaveBeenCalledWith({ route: 'deepseek-open-platform', select: true });
    expect(calls.selectFastRoleModel).toHaveBeenCalledWith({ route: 'deepseek-open-platform', modelId: 'deepseek-flash' });
  });

  it('tests the chosen model\'s connection on the existing path and states its declared capabilities', async () => {
    const { node, render, calls } = flow(settings(['opencode-go']));
    expect(node.textContent).toContain('能力：文本回答已核验 · 流式已核验 · 工具调用已核验');
    expect(node.textContent).toContain('尚未测试；保存凭据不等于连接成功');
    button(node, 'test-flow-connection').click();
    await vi.waitFor(() => expect(render).toHaveBeenCalled());
    expect(calls.testModelServiceConnection).toHaveBeenCalledWith({ route: 'opencode-go', modelId: 'deepseek-v4.1-flash' });
  });
});

describe('the header\'s compact channel / model selector', () => {
  it('names the one choice both roles hold, or each role when they differ', () => {
    expect(compactModelSelectionLabel(settings(['deepseek-open-platform']))).toBe('模型 · DeepSeek 开放平台（官方） / DeepSeek V4.1 Flash · 可用');
    expect(compactModelSelectionLabel(settings(['opencode-go', 'openai-platform'], 'opencode-go', 'openai-platform')))
      .toBe('主编辑 · OpenCode Go / DeepSeek V4.1 Flash · 可用 · 快速交互 · OpenAI 官方 / GPT-5.6 Luna · 可用');
    expect(compactModelSelectionLabel(settings([], null))).toBe('主编辑 · 需设置 · 快速交互 · 需设置');
  });

  it('shows on Book screens only, offering the ready choices and applying one to both roles', async () => {
    const calls = api(settings(['opencode-go', 'deepseek-open-platform'], 'opencode-go'));
    const selector = compactModelSelector({ api: calls, openModelService: vi.fn(), setStatus: vi.fn(), errorMessage: (_error, fallback) => fallback });
    const root = selector.element as unknown as MiniElement;
    selector.follow(false);
    expect(root.hidden).toBe(true);
    selector.follow(true);
    await vi.waitFor(() => expect(root.querySelectorAll('input')).toHaveLength(2));
    expect(root.querySelector('[data-compact-model-selection="fast-interaction"]')!.textContent).toBe('模型 · OpenCode Go / DeepSeek V4.1 Flash · 可用');
    const other = root.querySelectorAll('input').find((radio) => radio.value === 'deepseek-open-platform/deepseek-flash')!;
    other.checked = true;
    other.dispatchEvent({ type: 'change', bubbles: true });
    root.querySelectorAll('button').find((node) => node.textContent === USE_FOR_BOTH_ROLES_LABEL)!.click();
    await vi.waitFor(() => expect(calls.selectFastRoleModel).toHaveBeenCalledWith({ route: 'deepseek-open-platform', modelId: 'deepseek-flash' }));
    expect(calls.saveModelServiceCredential).toHaveBeenCalledWith({ route: 'deepseek-open-platform', select: true });
    selector.follow(false);
    expect([root.hidden, root.querySelectorAll('input,button').length]).toEqual([true, 0]);
  });
});
