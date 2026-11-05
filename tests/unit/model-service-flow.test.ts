import { collectTechnicalDisclosures, setTechnicalLayerVisible } from '../../src/renderer/technical-layer.js';
import { expectNoTechnicalText } from '../support/technical-layer-scan.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { modelServiceChannels } from '../../src/service/launch-policy.js';
import { MODEL_SERVICE_ROUTES, MODEL_SERVICE_ROUTE_BINDINGS, type ModelServiceRouteId, type ModelServiceSettingsProjection } from '../../src/shared/protocol.js';
import { USE_FOR_BOTH_ROLES_LABEL, modelRolesLabel, modelServiceChoices, modelServiceFlow, type ModelServiceFlowApi } from '../../src/renderer/model-service-flow.js';
import { createModelServiceSettings } from '../../src/renderer/model-service-settings.js';
import { installMiniDom, type MiniElement } from '../support/mini-dom.js';

// 设置 › 模型服务's one flow and the header's compact selector (Issue #1215), over the real generated channel catalogue and a
// synthetic settings projection: no credential value exists anywhere in it, and every API call is a stub.
let restore: () => void;
beforeEach(() => { restore = installMiniDom(); setTechnicalLayerVisible(true); });
afterEach(() => restore());

function settings(ready: ReadonlyArray<ModelServiceRouteId>, inUse: ModelServiceRouteId | null = ready[0] ?? null, fast: ModelServiceRouteId | null = inUse): ModelServiceSettingsProjection {
  const connection = (route: ModelServiceRouteId) => ({ connectionName: '合成连接', credentialOperationState: 'ready', connectionTest: null, binding: MODEL_SERVICE_ROUTE_BINDINGS[route] });
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
    removeModelServiceCredential: vi.fn(async () => answer),
    selectMainRoleModel: vi.fn(async () => answer),
    selectFastRoleModel: vi.fn(async () => answer),
    selectBothRoleModels: vi.fn(async () => answer),
    refreshModelServiceModels: vi.fn(async () => answer),
    testModelServiceConnection: vi.fn(async () => answer),
    getModelServiceSettings: vi.fn(async () => answer),
  };
}

function flow(projection: ModelServiceSettingsProjection, calls = api()) {
  const render = vi.fn();
  const setStatus = vi.fn();
  const node = modelServiceFlow(projection, { api: calls, render, setStatus, errorMessage: (_error, fallback) => fallback, channel: null, chooseChannel: vi.fn() }) as unknown as MiniElement;
  return { node, render, calls, setStatus };
}

const button = (root: MiniElement, action: string) => root.querySelector(`button[data-action="${action}"]`)!;
const pickChannel = (root: MiniElement, channelId: string) => {
  const radio = root.querySelector(`[data-model-channel="${channelId}"] input`)!;
  radio.checked = true;
  radio.dispatchEvent({ type: 'change', bubbles: true });
};

describe('the one model-service flow', () => {
  it.each(['deepseek-open-platform', 'openai-platform', 'anthropic-claude', 'google-gemini', 'opencode-zen'] as const)(
    'keeps ordinary channel %s through credential save, model selection and connection test', async (route) => {
      setTechnicalLayerVisible(false);
      const complete = (ready: ModelServiceRouteId[]) => ({ ...settings(ready, 'opencode-go'),
        routeChoice: { ...settings(ready, 'opencode-go').routeChoice, unsupportedProviders: [] },
        proxy: { mode: 'direct' }, lastProxyProbe: null, searchBackends: { backends: [], candidates: [] },
        protectedSecretStore: { label: '合成凭据库', availability: 'available' }, authorityStatement: '合成设置',
        launchPolicy: { integrityState: 'verified', providerProcessing: { authorizedLiveTransmissionCount: 0, label: '本地' },
          externalExport: { label: '未授权' }, publicReleasePermission: { label: '未授权' } },
      }) as unknown as ModelServiceSettingsProjection;
      const calls = api(complete(['opencode-go', route]));
      vi.mocked(calls.getModelServiceSettings).mockResolvedValue(complete(['opencode-go']));
      vi.stubGlobal('window', { ai7: calls, setInterval: () => 0, clearInterval: () => undefined });
      try {
        const element = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] => {
          const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node;
        };
        const root = element('main');
        const page = root as unknown as MiniElement;
        const screen = createModelServiceSettings({ element, panel: () => element('section'), setStatus: vi.fn(), initializeStartup: vi.fn(), returnToOrigin: vi.fn(),
          button: (label, className, action) => { const node = element('button', className, label); node.addEventListener('click', () => void action()); return node; },
          rendererErrorMessage: (_error, fallback) => fallback, replaceScreen: (_state, content) => root.replaceChildren(content) });
        await screen.renderModelServiceSettings();
        const channel = page.querySelector('select[aria-label="渠道"]')!;
        channel.value = route; channel.dispatchEvent({ type: 'change' });
        const secret = page.querySelectorAll('input').find((input) => input.type === 'password')!;
        secret.value = 'synthetic-key'; secret.dispatchEvent({ type: 'input' });
        page.querySelector('.model-credential-form')!.dispatchEvent({ type: 'submit' });
        await vi.waitFor(() => expect(page.querySelector('[data-credential-state="ready"]')).not.toBeNull());
        expect(calls.saveModelServiceCredential).toHaveBeenCalledWith(expect.objectContaining({ route }));
        expect(page.querySelector('select[aria-label="渠道"]')!.value).toBe(route);
        expect(page.querySelector('[data-model-service-flow]')!.dataset['flowChannel']).toBe(route);
        const model = page.querySelector('select[aria-label="AI7 使用的模型"]')!;
        expect(model.disabled).toBe(false);
        model.value = model.children.at(-1)!.value; model.dispatchEvent({ type: 'change' });
        button(page, 'use-model-for-both-roles').click();
        await vi.waitFor(() => expect(calls.selectBothRoleModels).toHaveBeenCalledWith({ route, modelId: model.value }));
        await vi.waitFor(() => expect(page.querySelector('select[aria-label="AI7 使用的模型"]')!.value).toBe(model.value));
        button(page, 'test-flow-connection').click();
        await vi.waitFor(() => expect(calls.testModelServiceConnection).toHaveBeenCalledWith({ route, modelId: model.value }));
      } finally { vi.unstubAllGlobals(); setTechnicalLayerVisible(true); }
    });

  it('saves and removes credentials inline, including a channel with an empty catalogue', async () => {
    const projection = settings([], null);
    const zen = projection.channels.find((channel) => channel.channelId === 'opencode-zen')!;
    Object.assign(zen, { models: [] });
    const { node, calls, render } = flow(projection);
    pickChannel(node, 'opencode-zen');
    expect(node.querySelectorAll('select')).toHaveLength(0);
    expect(node.querySelector('[data-action="enter-channel-credential"]')).toBeNull();
    const secret = node.querySelectorAll('input').find((input) => input.type === 'password')!;
    const save = button(node, 'save-channel-credential');
    expect(save.disabled).toBe(true);
    secret.value = 'synthetic-key'; secret.dispatchEvent({ type: 'input' });
    expect(save.disabled).toBe(false);
    node.querySelector('form')!.dispatchEvent({ type: 'submit', preventDefault: () => undefined });
    await vi.waitFor(() => expect(render).toHaveBeenCalled());
    expect(secret.value).toBe('');
    expect(calls.saveModelServiceCredential).toHaveBeenCalledWith({ route: 'opencode-zen', connectionName: 'OpenCode Zen', secret: 'synthetic-key' });
    const ready = flow(settings(['opencode-zen']), calls).node;
    button(ready, 'remove-model-service-credential').click();
    await vi.waitFor(() => expect(calls.removeModelServiceCredential).toHaveBeenCalledWith({ route: 'opencode-zen' }));
  });
  it('refreshes the channel catalogue and chooses a custom ID independently for either role', async () => {
    const { node, calls } = flow(settings(['anthropic-claude']));
    const custom = node.querySelector('[data-custom-model-id]')!;
    custom.value = 'account/custom-opus'; custom.dispatchEvent({ type: 'input' });
    button(node, 'select-main-role-model').click();
    await vi.waitFor(() => expect(calls.selectMainRoleModel).toHaveBeenCalledWith({ route: 'anthropic-claude', modelId: 'account/custom-opus' }));
    button(node, 'select-fast-role-model').click();
    await vi.waitFor(() => expect(calls.selectFastRoleModel).toHaveBeenCalledWith({ route: 'anthropic-claude', modelId: 'account/custom-opus' }));
    expect(node.querySelector('[data-action="refresh-model-list"]')).toBeNull();
    expect(calls.testModelServiceConnection).not.toHaveBeenCalled();
  });

  it('shows refresh failure as an error with the discovery reason', async () => {
    const responseProjection = Object.assign(settings(['anthropic-claude']), {
      modelDiscovery: { status: 'failure', code: 'AI7_PROXY_UNREACHABLE', reason: '代理不可达：请检查网络代理设置' },
    });
    const { node, setStatus } = flow(Object.assign(settings(['anthropic-claude']), { modelDiscovery: { status: 'failure', code: 'MODEL_SERVICE_UNREACHABLE', reason: '暂时无法获取模型' } }), api(responseProjection));
    button(node, 'retry-model-list').click();
    await vi.waitFor(() => expect(setStatus).toHaveBeenCalledWith('代理不可达：请检查网络代理设置', 'error'));
  });

  it('shows the model count after a successful refresh', async () => {
    const responseProjection = Object.assign(settings(['anthropic-claude']), { modelDiscovery: { status: 'success', modelCount: 7 } });
    const { node, setStatus } = flow(Object.assign(settings(['anthropic-claude']), { modelDiscovery: { status: 'failure', code: 'MODEL_SERVICE_UNREACHABLE', reason: '暂时无法获取模型' } }), api(responseProjection));
    button(node, 'retry-model-list').click();
    await vi.waitFor(() => expect(setStatus).toHaveBeenCalledWith('模型列表已刷新，共 7 个可用模型。', 'success'));
  });

  it('reports a foreground discovery failure even when the catalogue is unchanged', async () => {
    const projection = { ...settings(['deepseek-open-platform']),
      routeChoice: { ...settings(['deepseek-open-platform']).routeChoice, unsupportedProviders: [] },
      proxy: { mode: 'direct' }, lastProxyProbe: null, searchBackends: { backends: [], candidates: [] },
      protectedSecretStore: { label: '合成凭据库', availability: 'available' }, authorityStatement: '合成设置',
      modelDiscovery: { status: 'failure', code: 'MODEL_SERVICE_UNREACHABLE', reason: '模型服务不可达，请检查网络或网络代理设置' },
      launchPolicy: { integrityState: 'verified', providerProcessing: { authorizedLiveTransmissionCount: 0, label: '本地' },
        externalExport: { label: '未授权' }, publicReleasePermission: { label: '未授权' } },
    } as unknown as ModelServiceSettingsProjection;
    const calls = api(projection);
    // Ordinary settings reads omit the transient discovery result; explicit refresh returns it.
    const { modelDiscovery: _discovery, ...storedSettings } = projection;
    vi.mocked(calls.getModelServiceSettings).mockResolvedValue(storedSettings);
    let poll: (() => void) | undefined;
    vi.stubGlobal('window', { ai7: calls, setInterval: (tick: () => void) => { poll = tick; return 0; }, clearInterval: () => undefined });
    try {
      const element = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] => {
        const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node;
      };
      const root = element('main'); document.body.append(root);
      const setStatus = vi.fn();
      const replaceScreen = vi.fn((_state: string, content: HTMLElement) => root.replaceChildren(content));
      const screen = createModelServiceSettings({ element, panel: () => element('section'), setStatus, initializeStartup: vi.fn(), returnToOrigin: vi.fn(),
        button: (label, className, action) => { const node = element('button', className, label); node.addEventListener('click', () => void action()); return node; },
        rendererErrorMessage: (_error, fallback) => fallback, replaceScreen });
      await screen.renderModelServiceSettings();
      const page = root as unknown as MiniElement;
      const secret = page.querySelectorAll('input').find((input) => input.type === 'password')!;
      secret.value = 'synthetic-key'; secret.dispatchEvent({ type: 'input' });
      page.querySelector('.model-credential-form')!.dispatchEvent({ type: 'submit' });
      await vi.waitFor(() => expect(setStatus).toHaveBeenLastCalledWith(`凭据已保存，但无法获取模型列表：${projection.modelDiscovery!.reason}`, 'error'));
      // The real visibility listener follows settings after role choices return to their original values.
      (document.body as unknown as MiniElement).dispatchEvent({ type: 'visibilitychange' });
      await vi.waitFor(() => expect(calls.refreshModelServiceModels).toHaveBeenCalledOnce());
      expect(setStatus).toHaveBeenLastCalledWith(projection.modelDiscovery!.reason, 'error');
      const technical = root.querySelector('.model-service-technical')!;
      expect(technical.open).toBe(false);
      expect(technical.querySelector('[data-model-discovery-code="MODEL_SERVICE_UNREACHABLE"]')).not.toBeNull();
      poll!();
      await vi.waitFor(() => expect(calls.getModelServiceSettings).toHaveBeenCalledTimes(3));
      expect(root.querySelector('.model-service-technical') === technical).toBe(true);
      expect(replaceScreen).toHaveBeenCalledTimes(2);
    } finally { vi.unstubAllGlobals(); }
  });

  it('shows saved credentials separately when discovery fails', async () => {
    const responseProjection = Object.assign(settings(['anthropic-claude']), {
      modelDiscovery: { status: 'failure', code: 'MODEL_DISCOVERY_CREDENTIAL_REJECTED', reason: '模型服务拒绝了凭据' },
    });
    const { node, setStatus } = flow(settings([], null), api(responseProjection));
    pickChannel(node, 'anthropic-claude');
    const secret = node.querySelectorAll('input').find((input) => input.type === 'password')!;
    secret.value = 'synthetic-key'; secret.dispatchEvent({ type: 'input' });
    node.querySelector('form')!.dispatchEvent({ type: 'submit', preventDefault: () => undefined });
    await vi.waitFor(() => expect(setStatus).toHaveBeenCalledWith('凭据已保存，但无法获取模型列表：模型服务拒绝了凭据', 'error'));
  });

  it.each([
    ['available', '代理可用', 'success'],
    ['https-rejected', '代理不接受 HTTPS 连接，请改用 http://host:port', 'error'],
    ['connection-refused', '代理不可达：端口没有在监听', 'error'],
    ['authentication-required', '代理要求认证，当前版本不支持', 'error'],
  ] as const)('shows %s after saving and retains the result through settings navigation', async (status, message, tone) => {
    const projection = { ...settings([], null), roles: [],
      routeChoice: { ...settings([], null).routeChoice, unsupportedProviders: [] },
      proxy: { mode: 'proxy', protocol: 'http', hostPort: '127.0.0.1:7897' },
      lastProxyProbe: { status, checkedAt: '2026-11-04T12:00:00.000Z' }, searchBackends: { backends: [], candidates: [] },
      protectedSecretStore: { label: '合成凭据库', availability: 'available' }, authorityStatement: '合成设置',
      modelDiscovery: { status: 'failure', code: 'MODEL_DISCOVERY_CREDENTIAL_REJECTED', reason: '模型服务拒绝了凭据' },
      launchPolicy: { integrityState: 'verified', providerProcessing: { authorizedLiveTransmissionCount: 0, label: '本地' },
        externalExport: { label: '未授权' }, publicReleasePermission: { label: '未授权' } },
    } as unknown as ModelServiceSettingsProjection;
    const calls = { getModelServiceSettings: vi.fn(async () => projection), saveModelServiceProxy: vi.fn(async () => projection) };
    vi.stubGlobal('window', { ai7: calls, setInterval: () => 0, clearInterval: () => undefined });
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
      const screen = createModelServiceSettings({ element, panel: () => element('section'), setStatus, initializeStartup, returnToOrigin: initializeStartup,
        button: (label, className, action) => {
          const node = element('button', className, label); node.addEventListener('click', () => void action()); return node;
        },
        rendererErrorMessage: (_error, fallback) => fallback,
        replaceScreen: (_state, content) => root.replaceChildren(content),
      });
      await screen.renderModelServiceSettings();
      const page = root as unknown as MiniElement;
      expect(page.querySelector('[aria-label="代理 URL"]')!.placeholder).toBe('http://127.0.0.1:端口');
      expect(page.textContent).toContain('仅在代理支持 TLS 时使用 https://');
      expect(page.querySelector('.model-service-technical [data-model-discovery-code]')!.textContent).toContain('MODEL_DISCOVERY_CREDENTIAL_REJECTED');
      pickChannel(page, 'anthropic-claude');
      page.querySelector('[data-model-service-proxy] form')!.dispatchEvent({ type: 'submit' });
      await vi.waitFor(() => expect(calls.saveModelServiceProxy).toHaveBeenCalledWith({ mode: 'proxy', protocol: 'http', hostPort: '127.0.0.1:7897', probeRoute: 'anthropic-claude' }));
      await vi.waitFor(() => expect(setStatus).toHaveBeenLastCalledWith(message, tone));
      expect(page.querySelector('[data-model-service-flow]')!.dataset['flowChannel']).toBe('anthropic-claude');
      await screen.renderModelServiceSettings();
      expect(page.querySelector(`[data-proxy-probe-status="${status}"]`)!.textContent).toContain(message);
      expect(page.textContent).toContain(new Date(projection.lastProxyProbe!.checkedAt).toLocaleString());
      expect(page.querySelector('[data-model-service-flow]')!.dataset['flowChannel']).toBe('opencode-go');
      expect(setStatus).toHaveBeenLastCalledWith('模型服务设置已打开');
      setTechnicalLayerVisible(false);
      calls.getModelServiceSettings.mockResolvedValue({ ...projection, launchPolicy: { ...projection.launchPolicy,
        providerProcessing: { ...projection.launchPolicy.providerProcessing, label: '本机生产：需先设置模型服务，当前不会传输' } } });
      await screen.renderModelServiceSettings();
      expect(page.querySelector('[data-policy-integrity-state]')?.textContent).toBe('尚未设置模型服务，当前不会发送内容。');
      expect(page.textContent).toContain('合成设置');
      calls.getModelServiceSettings.mockResolvedValue({ ...projection, launchPolicy: { ...projection.launchPolicy,
        integrityState: 'denied', denialReason: 'binding-not-allowed' } });
      await screen.renderModelServiceSettings();
      expect(page.querySelector('[data-policy-integrity-state]')?.textContent).toBe('当前模型连接不在允许范围内。');
      setTechnicalLayerVisible(true);
      page.querySelectorAll('button').find((node) => node.textContent === '返回')!.click();
      expect(initializeStartup).toHaveBeenCalledOnce();
    } finally { setTechnicalLayerVisible(true); vi.unstubAllGlobals(); }
  });

  it('lists the six channels and offers the in-use channel\'s model to both roles only once its credential is ready', () => {
    const fresh = flow(settings([], null)).node;
    expect(fresh.querySelectorAll('[data-model-channel]').map((label) => label.dataset['modelChannel'])).toEqual(
      ['opencode-go', 'deepseek-open-platform', 'openai-platform', 'anthropic-claude', 'google-gemini', 'opencode-zen']);
    expect(fresh.dataset['flowChannel']).toBe('opencode-go');
    expect(fresh.querySelector('[data-model-choice="deepseek-v4.1-flash"]')!.disabled).toBe(true);
    expect(button(fresh, 'use-model-for-both-roles').disabled).toBe(true);
    const ready = flow(settings(['deepseek-open-platform'])).node;
    expect(ready.dataset['flowChannel']).toBe('deepseek-open-platform');
    expect(ready.querySelector('[data-model-choice="deepseek-flash"]')!.checked).toBe(true);
  });

  it('offers Zen catalogue models without per-model live evidence, requiring its credential', () => {
    const { node } = flow(settings(['opencode-go']));
    pickChannel(node, 'opencode-zen');
    expect(node.dataset['flowChannel']).toBe('opencode-zen');
    const choices = node.querySelectorAll('[data-model-choice]');
    expect(choices.length).toBeGreaterThan(0);
    expect(choices.every((choice) => choice.disabled)).toBe(true);
    expect(node.querySelector('button[data-action="save-channel-credential"]')!.textContent).toBe('保存并获取模型');
    expect(node.querySelectorAll('.model-service-flow-ineligible li')).toHaveLength(0);
  });

  it('says a Fast-only model\'s Main disposition, and offers OpenAI to both roles now Main records it (#1225)', () => {
    const luna = modelServiceChannels().find((channel) => channel.channelId === 'openai-platform')!.models.find((model) => model.modelId === 'gpt-5.6-luna')!;
    expect([luna.main, luna.fast]).toEqual(['eligible', 'eligible']);
    expect(modelRolesLabel({ ...luna, main: 'channel-not-admitted-by-selected-policy' })).toBe('主编辑角色：当前渠道尚未获准（channel-not-admitted-by-selected-policy）；快速交互角色：可在高级设置中单独指定');
    const { node } = flow(settings(['opencode-go', 'openai-platform']));
    pickChannel(node, 'openai-platform');
    expect(Array.from(node.querySelectorAll('[data-model-choice]'), (choice) => choice.dataset['modelChoice'])).toEqual(expect.arrayContaining(['gpt-5.6-sol', 'gpt-5.6-luna']));
  });

  it('sets both roles through the existing route and Fast choices, and renders the settings that answer', async () => {
    const answer = settings(['opencode-go', 'deepseek-open-platform'], 'deepseek-open-platform');
    const { node, render, calls } = flow(settings(['opencode-go', 'deepseek-open-platform'], 'opencode-go'), api(answer));
    pickChannel(node, 'deepseek-open-platform');
    const use = button(node, 'use-model-for-both-roles');
    expect([use.disabled, use.textContent]).toEqual([false, USE_FOR_BOTH_ROLES_LABEL]);
    use.click();
    await vi.waitFor(() => expect(render).toHaveBeenCalledWith(answer));
    expect(calls.selectBothRoleModels).toHaveBeenCalledWith({ route: 'deepseek-open-platform', modelId: 'deepseek-flash' });
  });

  it('offers every Claude model without a connection test and saves both bindings atomically', async () => {
    const projection = settings(['opencode-go', 'anthropic-claude'], 'opencode-go');
    const { node, calls } = flow(projection);
    pickChannel(node, 'anthropic-claude');
    expect(modelServiceChoices(projection).filter((choice) => choice.route === 'anthropic-claude')).toHaveLength(4);
    expect(button(node, 'use-model-for-both-roles').disabled).toBe(false);
    button(node, 'use-model-for-both-roles').click();
    await vi.waitFor(() => expect(calls.selectBothRoleModels).toHaveBeenCalledWith({ route: 'anthropic-claude', modelId: 'claude-opus-5' }));
    expect(calls.testModelServiceConnection).not.toHaveBeenCalled();
  });

  it('tests the chosen model\'s connection on the existing path and states its declared capabilities', async () => {
    const { node, render, calls } = flow(settings(['opencode-go']));
    expect(node.textContent).toContain('能力：文本回答协议支持 · 流式协议支持 · 工具调用协议支持');
    expect(node.textContent).toContain('尚未测试；保存凭据不等于连接成功');
    button(node, 'test-flow-connection').click();
    await vi.waitFor(() => expect(render).toHaveBeenCalled());
    expect(calls.testModelServiceConnection).toHaveBeenCalledWith({ route: 'opencode-go', modelId: 'deepseek-v4.1-flash' });
  });

  it('shows busy immediately and keeps testing disabled through model changes until the request returns', async () => {
    const pending = Promise.withResolvers<ModelServiceSettingsProjection>();
    const calls = api();
    calls.testModelServiceConnection = vi.fn(() => pending.promise);
    const { node, render, setStatus } = flow(settings(['opencode-go']), calls);
    const test = button(node, 'test-flow-connection');
    test.click();
    expect(setStatus).toHaveBeenCalledExactlyOnceWith('正在测试连接…', 'busy');
    expect(test.disabled).toBe(true);
    const custom = node.querySelector('[data-custom-model-id]')!;
    custom.value = 'account/another-model'; custom.dispatchEvent({ type: 'input' });
    expect(test.disabled).toBe(true);
    test.dispatchEvent({ type: 'click' });
    expect(calls.testModelServiceConnection).toHaveBeenCalledOnce();
    pending.resolve(settings(['opencode-go']));
    await vi.waitFor(() => expect(render).toHaveBeenCalled());
    expect(test.disabled).toBe(false);
    expect(setStatus).toHaveBeenLastCalledWith(expect.stringContaining('DeepSeek V4.1 Flash'), 'error');
  });

  it.each([
    ['passed', null, '连接测试通过', 'success'],
    ['failed', 'INVALID_CREDENTIAL', '凭据被拒绝，请检查 API key', 'error'],
    ['failed', 'MODEL_SERVICE_UNREACHABLE', '模型服务不可达，请检查网络或网络代理', 'error'],
    ['failed', 'AI7_PROXY_UNREACHABLE', '代理不可达，请检查网络或网络代理', 'error'],
    ['failed', 'INVALID_RESPONSE', '请检查模型 ID 是否正确', 'error'],
    ['outcome-unknown', 'AI7_OUTCOME_UNKNOWN', '结果待确认', 'error'],
    ['cancelled', 'INTERRUPTED', '连接测试已取消', undefined],
  ] as const)('announces %s / %s and keeps the exact code in technical details', async (outcome, code, message, tone) => {
    const answer = settings(['opencode-go']);
    const model = answer.channels.find((channel) => channel.channelId === 'opencode-go')!.models[0]!;
    Object.assign(answer.routeChoice.routes[0]!.connection!, { connectionTest: {
      modelId: model.modelId, outcome, code, testedAt: '2026-11-04T12:00:00.000Z',
      credentialUpdatedAt: '2026-11-04T11:00:00.000Z', verified: 'buffered-text-only',
    } });
    const { node, calls, render, setStatus } = flow(settings(['opencode-go']), api(answer));
    button(node, 'test-flow-connection').click();
    await vi.waitFor(() => expect(render).toHaveBeenCalledWith(answer));
    expect(calls.testModelServiceConnection).toHaveBeenCalledOnce();
    expect(setStatus).toHaveBeenLastCalledWith(expect.stringContaining(message), tone);
    const banner = setStatus.mock.lastCall![0] as string;
    expect(banner).toContain(`OpenCode Go / ${model.modelLabel}`);
    if (code !== null) expect(banner).not.toContain(code);
    const painted = flow(answer).node;
    expect(painted.querySelector(`[data-model-choice="${model.modelId}"]`)!.checked).toBe(true);
    expect(painted.querySelector(`[data-connection-test-outcome="${outcome}"]`)!.textContent).toContain('文本连接测试');
    expect(painted.querySelector('.model-service-flow-feedback .technical-details')!.textContent).toContain(code ?? '无');
  });

  it('restores the test button after an API rejection without retrying', async () => {
    const calls = api();
    calls.testModelServiceConnection = vi.fn(async () => { throw new Error('synthetic rejection'); });
    const { node, setStatus } = flow(settings(['opencode-go']), calls);
    const test = button(node, 'test-flow-connection');
    test.click();
    await vi.waitFor(() => expect(setStatus).toHaveBeenLastCalledWith('连接测试没有完成；不会自动重试。', 'error'));
    expect(test.disabled).toBe(false);
    expect(calls.testModelServiceConnection).toHaveBeenCalledOnce();
  });
});


it('scans every channel model catalogue in ordinary mode (#1315)', () => {
  setTechnicalLayerVisible(false);
  try { for (const channel of MODEL_SERVICE_ROUTES) expectNoTechnicalText(flow(settings([channel])).node); }
  finally { setTechnicalLayerVisible(true); }
});

it('offers one ordinary model view and saves both underlying roles without a test prerequisite (#1331)', async () => {
  setTechnicalLayerVisible(false);
  const { node, calls } = flow(settings(['opencode-go'], 'opencode-go', null));
  expect(node.querySelectorAll('select')).toHaveLength(2);
  expect(node.querySelector('[data-action="select-main-role-model"]')).toBeNull();
  expect(node.querySelector('[data-action="select-fast-role-model"]')).toBeNull();
  expect(node.querySelector('[data-custom-model-id]')).toBeNull();
  expect(node.textContent).toContain('AI7 使用的模型');
  button(node, 'use-model-for-both-roles').click();
  await vi.waitFor(() => expect(calls.selectBothRoleModels).toHaveBeenCalledWith({ route: 'opencode-go', modelId: 'deepseek-v4.1-flash' }));
  expect(calls.testModelServiceConnection).not.toHaveBeenCalled();
});

it('scans connection-test feedback and the repainted model page when discovery uses the raw ID as its label', async () => {
  setTechnicalLayerVisible(false);
  try {
    const answer = settings(['deepseek-open-platform']);
    const model = answer.channels.find((channel) => channel.channelId === 'deepseek-open-platform')!.models[0]!;
    Object.assign(model, { modelLabel: model.modelId });
    const before = structuredClone(answer);
    Object.assign(answer.routeChoice.routes.find((route) => route.route === 'deepseek-open-platform')!.connection!, { connectionTest: {
      modelId: model.modelId, outcome: 'passed', code: null, testedAt: '2026-11-04T12:00:00.000Z',
      credentialUpdatedAt: '2026-11-04T11:00:00.000Z', verified: 'buffered-text-only',
    } });
    const { node, render, setStatus } = flow(before, api(answer));
    button(node, 'test-flow-connection').click();
    await vi.waitFor(() => expect(render).toHaveBeenCalledWith(answer));
    expectNoTechnicalText({ textContent: String(setStatus.mock.lastCall![0]) });
    const painted = flow(answer).node;
    expect(painted.querySelector('[data-connection-test-outcome="passed"]')!.textContent).toContain('文本连接测试通过');
    expectNoTechnicalText(painted);
    const projection = { ...answer, routeChoice: { ...answer.routeChoice, unsupportedProviders: [] },
      proxy: { mode: 'direct', protocol: 'http', hostPort: '' }, lastProxyProbe: null,
      searchBackends: { backends: [], candidates: [] }, protectedSecretStore: { label: '合成凭据库', availability: 'available' }, authorityStatement: '合成设置',
      launchPolicy: { integrityState: 'verified', providerProcessing: { authorizedLiveTransmissionCount: 0, label: '本地' },
        externalExport: { label: '未授权' }, publicReleasePermission: { label: '未授权' } },
    } as unknown as ModelServiceSettingsProjection;
    vi.stubGlobal('window', { ai7: api(projection) });
    try {
      const element = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] => {
        const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node;
      };
      const root = element('main');
      const page = createModelServiceSettings({ element, panel: () => element('section'), setStatus: vi.fn(), initializeStartup: vi.fn(), returnToOrigin: vi.fn(),
        button: (label, className, action) => { const node = element('button', className, label); node.addEventListener('click', () => void action()); return node; },
        rendererErrorMessage: (_error, fallback) => fallback, replaceScreen: (_state, content) => root.replaceChildren(content) });
      await page.renderModelServiceSettings();
      expect(root.querySelector('.model-service-settings')).not.toBeNull();
      expectNoTechnicalText(root);
      setTechnicalLayerVisible(true);
      await page.renderModelServiceSettings(); collectTechnicalDisclosures(root);
      expect(root.textContent?.match(/查看技术详情/gu)).toHaveLength(1);
    } finally { vi.unstubAllGlobals(); }
  } finally { setTechnicalLayerVisible(true); }
});
