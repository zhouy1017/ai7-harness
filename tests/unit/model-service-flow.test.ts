import { MODEL_SERVICE_CONNECTION_IDS } from '../../src/shared/protocol/model-service.js';
import { createDispatchChooser } from '../../src/renderer/components/dispatch-chooser.js';
import { collectTechnicalDisclosures, setTechnicalLayerVisible } from '../../src/renderer/technical-layer.js';
import { expectNoTechnicalText } from '../support/technical-layer-scan.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { modelServiceChannels } from '../../src/service/launch-policy.js';
import { MODEL_SERVICE_ROUTES, MODEL_SERVICE_ROUTE_BINDINGS, type ModelServiceRouteId, type ModelServiceSettingsProjection } from '../../src/shared/protocol.js';
import { USE_FOR_BOTH_ROLES_LABEL, modelRolesLabel, modelServiceChoices, modelServiceFlow, type ModelServiceFlowApi, type ModelServiceFlowOptions } from '../../src/renderer/model-service-flow.js';
import { createModelServiceSettings } from '../../src/renderer/model-service-settings.js';
import { preferenceDefaults, type PreferencesRendererApi, type PreferenceValues } from '../../src/shared/preferences.js';
import { installMiniDom, type MiniElement } from '../support/mini-dom.js';

// 设置 › 模型服务's one flow and the header's compact selector (Issue #1215), over the real generated channel catalogue and a
// synthetic settings projection: no credential value exists anywhere in it, and every API call is a stub.
let restore: () => void;
beforeEach(() => { restore = installMiniDom(); setTechnicalLayerVisible(true); });
afterEach(() => restore());

function settings(ready: ReadonlyArray<ModelServiceRouteId>, inUse: ModelServiceRouteId | null = ready[0] ?? null, fast: ModelServiceRouteId | null = inUse): ModelServiceSettingsProjection {
  const connection = (route: ModelServiceRouteId) => ({ connectionId: MODEL_SERVICE_CONNECTION_IDS[route], connectionName: '合成连接', credentialOperationState: 'ready', connectionTest: null, binding: MODEL_SERVICE_ROUTE_BINDINGS[route] });
  const role = (roleId: string, route: ModelServiceRouteId | null) => ({ roleId, roleLabel: roleId === 'main-editorial' ? '主编辑角色' : '快速交互角色', statusLabel: route === null ? '需设置' : '可用', binding: route === null ? null : MODEL_SERVICE_ROUTE_BINDINGS[route], connection: route === null ? null : connection(route) });
  return {
    channels: modelServiceChannels(),
    roles: [role('fast-interaction', fast), role('main-editorial', inUse ?? 'opencode-go')],
    modelRoles: ['foreground-pro','foreground-flash','underlying-pro','underlying-flash'].map(roleId => ({ ...role(roleId, roleId.endsWith('flash') ? fast ?? inUse : inUse), roleId, status: inUse === null ? 'setup-required' : 'available', source: roleId.endsWith('flash') && fast !== null ? 'flash-tier' : roleId === 'foreground-pro' ? 'pro-tier' : 'follows-foreground-pro', sourceLabel: '跟随前台 Pro', statusDetail: null })),
    routeChoice: { routes: MODEL_SERVICE_ROUTES.map((route) => ({ route, inUse: route === inUse, statusLabel: ready.includes(route) ? '可用' : '需设置', connection: ready.includes(route) ? connection(route) : null })) },
  } as unknown as ModelServiceSettingsProjection;
}

function api(answer = settings(['opencode-go'])): ModelServiceFlowApi & PreferencesRendererApi & { getModelServiceSettings: () => Promise<ModelServiceSettingsProjection> } {
  return {
    saveModelServiceCredential: vi.fn(async () => answer),
    removeModelServiceCredential: vi.fn(async () => answer),
    selectUnderlyingModel: vi.fn(async () => answer),
    selectProModel: vi.fn(async () => answer),
    selectFlashModel: vi.fn(async () => answer),
    clearFlashModel: vi.fn(async () => answer),
    refreshModelServiceModels: vi.fn(async () => answer),
    testModelServiceConnection: vi.fn(async () => answer),
    getModelServiceSettings: vi.fn(async () => answer),
    getPreferences: vi.fn(async () => ({ version: 1 as const, values: preferenceDefaults(), notice: null })),
    savePreference: vi.fn(async () => ({ version: 1 as const, values: preferenceDefaults(), notice: null })),
  };
}

function flow(projection: ModelServiceSettingsProjection, calls = api(), options: Partial<ModelServiceFlowOptions> = {}) {
  const render = vi.fn();
  const setStatus = vi.fn();
  const node = modelServiceFlow(projection, { api: calls, render, setStatus, errorMessage: (_error, fallback) => fallback, channel: null, chooseChannel: vi.fn(), ...options }) as unknown as MiniElement;
  return { node, render, calls, setStatus };
}

const button = (root: MiniElement, action: string) => root.querySelector(`button[data-action="${action}"]`)!;
const setEffort = (root: MiniElement, tier: 'main' | 'fast', value: string) => {
  const label = tier === 'main' ? '思考强度' : '较轻模型的思考强度';
  const select = root.querySelector(`select[aria-label="${label}"]`)!;
  const known = select.querySelectorAll('option').some(option => option.value === value);
  select.value = known ? value : '__other'; select.dispatchEvent({ type: 'change', bubbles: true });
  if (!known) { const input = root.querySelector(`input[data-reasoning-effort="${tier}"]`)!; input.value = value; input.dispatchEvent({ type: 'input', bubbles: true }); }
};
const pickChannel = (root: MiniElement, channelId: string) => {
  const radio = root.querySelector(`[data-model-channel="${channelId}"] input`)!;
  radio.checked = true;
  radio.dispatchEvent({ type: 'change', bubbles: true });
};

function completeSettings(): ModelServiceSettingsProjection {
  const projection = settings(['opencode-go', 'anthropic-claude']);
  return { ...projection, routeChoice: { ...projection.routeChoice, unsupportedProviders: [] },
    proxy: { mode: 'direct' }, lastProxyProbe: null, searchBackends: { backends: [], candidates: [] },
    protectedSecretStore: { label: '合成凭据库', availability: 'available' }, authorityStatement: '合成设置',
    launchPolicy: { integrityState: 'verified', providerProcessing: { authorizedLiveTransmissionCount: 0, label: '本地' },
      externalExport: { label: '未授权' }, publicReleasePermission: { label: '未授权' } },
  } as unknown as ModelServiceSettingsProjection;
}

function mountSettings(calls: ReturnType<typeof api>) {
  let poll: (() => void) | undefined;
  vi.stubGlobal('window', { ai7: calls, setInterval: (tick: () => void) => { poll = tick; return 0; }, clearInterval: () => undefined });
  const element = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] => {
    const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node;
  };
  const root = element('main'); document.body.append(root);
  const screen = createModelServiceSettings({ element, panel: () => element('section'), setStatus: vi.fn(), initializeStartup: vi.fn(),
    button: (label, className, action) => { const node = element('button', className, label); node.addEventListener('click', () => void action()); return node; },
    rendererErrorMessage: (_error, fallback) => fallback, replaceScreen: (_state, content) => root.replaceChildren(content) });
  return { screen, node: root as unknown as MiniElement, poll: () => poll!() };
}

describe('the one model-service flow', () => {
  it('saves the selected channel and effort to the underlying role and can restore its inherited choice', async () => {
    const { node, calls } = flow(settings(['anthropic-claude']));
    setEffort(node, 'main', 'high');
    button(node, 'select-underlying-pro').click();
    await vi.waitFor(() => expect(calls.selectUnderlyingModel).toHaveBeenCalledWith(expect.objectContaining({
      roleId: 'underlying-pro', route: 'anthropic-claude', reasoningEffort: 'high' })));
    button(node, 'inherit-underlying-pro').click();
    await vi.waitFor(() => expect(calls.selectUnderlyingModel).toHaveBeenCalledWith({ roleId: 'underlying-pro', inherit: true }));
  });

  it('still draws the page, with the reason and a retry, when 设置 cannot read the model service (#1522)', async () => {
    setTechnicalLayerVisible(false);
    const calls = api(completeSettings());
    vi.mocked(calls.getModelServiceSettings).mockRejectedValueOnce(new Error('unreadable'));
    const { screen, node } = mountSettings(calls);
    try {
      await screen.renderModelServiceSettings();
      expect(node.querySelector('.model-service-settings h2')?.textContent).toBe('模型服务');
      expect(node.querySelector('.attention-note')?.textContent).toBe('无法读取模型服务设置。');
      node.querySelectorAll('button').find((item) => item.textContent === '重试')!.click();
      await vi.waitFor(() => expect(node.querySelector('[data-model-summary]')).not.toBeNull());
    } finally { setTechnicalLayerVisible(true); vi.unstubAllGlobals(); }
  });
  it('keeps an unsaved effort when a catalogue poll finishes after focus moves to Save (#1453)', async () => {
    setTechnicalLayerVisible(false);
    const projection = completeSettings(), calls = api(projection);
    const { screen, node, poll } = mountSettings(calls);
    try {
      await screen.renderModelServiceSettings();
      const effort = node.querySelector('input[aria-label="思考强度其他"]')!;
      setEffort(node, 'main', 'vendor-future-level');
      button(node, 'use-model-for-both-roles').focus();
      const changed = structuredClone(projection);
      Object.assign(changed.channels[0]!, { channelLabel: 'Updated public catalogue' });
      vi.mocked(calls.getModelServiceSettings).mockResolvedValue(changed);
      poll();
      await vi.waitFor(() => expect(calls.getModelServiceSettings).toHaveBeenCalledTimes(2));
      expect(node.querySelector('input[aria-label="思考强度其他"]') === effort).toBe(true);
      expect(effort.value).toBe('vendor-future-level');
      button(node, 'use-model-for-both-roles').click();
      await vi.waitFor(() => expect(calls.selectProModel).toHaveBeenCalledWith(expect.objectContaining({ reasoningEffort: 'vendor-future-level' })));
    } finally { vi.unstubAllGlobals(); }
  });

  it.each([true, false])('chooses and reopens a role effort default, including a custom identifier (technical=%s, #1453)', async (technical) => {
    setTechnicalLayerVisible(technical);
    const projection = settings(['anthropic-claude']);
    const { node, calls } = flow(projection);
    const effort = node.querySelector('input[aria-label="思考强度其他"]')!;
    expect(effort.value).toBe('');
    setEffort(node, 'main', 'high');
    expect(button(node, 'use-model-for-both-roles').disabled).toBe(false);
    button(node, 'use-model-for-both-roles').click();
    await vi.waitFor(() => expect(calls.selectProModel).toHaveBeenCalledWith({ route: 'anthropic-claude', modelId: 'claude-opus-5', reasoningEffort: 'high' }));
    const saved = { ...projection, modelRoles: projection.modelRoles.map((role) => ({ ...role,
      binding: role.binding === null ? null : { ...role.binding, reasoningEffort: role.roleId === 'foreground-pro' ? 'high' : 'low' } })) };
    const reopened = flow(saved).node;
    expect(reopened.querySelector('input[aria-label="思考强度其他"]')!.value).toBe('high');
    const fastEffort = node.querySelector('input[aria-label="较轻模型的思考强度其他"]')!;
    setEffort(node, 'fast', 'vendor-future-level');
    button(node, 'select-fast-role-model').click();
    await vi.waitFor(() => expect(calls.selectFlashModel).toHaveBeenCalledWith({ route: 'anthropic-claude', modelId: 'claude-opus-5', reasoningEffort: 'vendor-future-level' }));
  });

  it('reopens and re-saves independent main high / fast low without changing the other role (#1453 review)', async () => {
    const projection = settings(['anthropic-claude']);
    const saved = { ...projection, modelRoles: projection.modelRoles.map((role) => ({ ...role,
      binding: role.binding === null ? null : { ...role.binding, reasoningEffort: role.roleId === 'foreground-pro' ? 'high' : 'low' } })) };
    const { node, calls } = flow(saved);
    expect(node.querySelector('input[aria-label="思考强度其他"]')!.value).toBe('high');
    expect(node.querySelector('input[aria-label="较轻模型的思考强度其他"]')!.value).toBe('low');
    button(node, 'select-fast-role-model').click();
    await vi.waitFor(() => expect(calls.selectFlashModel).toHaveBeenCalledWith(expect.objectContaining({ reasoningEffort: 'low' })));
    expect(calls.selectProModel).not.toHaveBeenCalled();
    const main = node.querySelector('input[aria-label="思考强度其他"]')!;
    setEffort(node, 'main', 'medium');
    button(node, 'use-model-for-both-roles').click();
    await vi.waitFor(() => expect(calls.selectProModel).toHaveBeenCalledWith(expect.objectContaining({ reasoningEffort: 'medium' })));
  });

  it('keeps both unsaved efforts through connection-test and refresh action renders (#1453 review)', async () => {
    const calls = api(completeSettings());
    const { screen, node } = mountSettings(calls);
    try {
      await screen.renderModelServiceSettings();
      for (const [role, value] of [['主编辑', 'high'], ['快速交互', 'low']]) {
        setEffort(node, role === '主编辑' ? 'main' : 'fast', value!);
      }
      button(node, 'test-flow-connection').click();
      await vi.waitFor(() => expect(calls.testModelServiceConnection).toHaveBeenCalledWith(expect.objectContaining({ reasoningEffort: 'high' })));
      await vi.waitFor(() => expect(node.querySelector('input[aria-label="较轻模型的思考强度其他"]')!.value).toBe('low'));
      expect(node.querySelector('input[aria-label="思考强度其他"]')!.value).toBe('high');
      button(node, 'test-fast-flow-connection').click();
      await vi.waitFor(() => expect(calls.testModelServiceConnection).toHaveBeenLastCalledWith(expect.objectContaining({ reasoningEffort: 'low' })));
      expect(node.querySelector('input[aria-label="思考强度其他"]')!.value).toBe('high');
      button(node, 'retry-model-list').click();
      await vi.waitFor(() => expect(calls.refreshModelServiceModels).toHaveBeenCalled());
      await vi.waitFor(() => expect(node.querySelector('input[aria-label="思考强度其他"]')!.value).toBe('high'));
      expect(node.querySelector('input[aria-label="较轻模型的思考强度其他"]')!.value).toBe('low');
    } finally { vi.unstubAllGlobals(); }
  });

  // A manual model ID is the developer layer's (#1431 item 97), so only the technical layer offers it.
  it.each([true])('restores the last explicit catalogue choice after clearing a manual ID (technical=%s, #1374)', async (technical) => {
    setTechnicalLayerVisible(technical);
    const { node, calls } = flow(settings(['anthropic-claude']));
    const choices = node.querySelectorAll('[data-model-choice]');
    const selector = node.querySelector('select[aria-label="AI7 使用的模型"]');
    const chosen = technical ? choices.at(-1)! : selector!;
    const modelId = technical ? chosen.value : selector!.children.at(-1)!.value;
    chosen.value = modelId; chosen.checked = true; chosen.dispatchEvent({ type: 'change' });
    const filter = node.querySelector('input[aria-label="筛选模型"]')!;
    filter.value = 'no-matching-model'; filter.dispatchEvent({ type: 'input' });
    const custom = node.querySelector('[data-custom-model-id]')!;
    custom.value = 'synthetic/manual-model'; custom.dispatchEvent({ type: 'input' });
    expect(choices.every((radio) => !radio.checked)).toBe(true);
    custom.value = ' '; custom.dispatchEvent({ type: 'input' });
    expect(technical ? choices.find((radio) => radio.value === modelId)!.checked : selector!.value).toBe(technical ? true : modelId);
    expect(button(node, 'test-flow-connection').disabled).toBe(false);
    button(node, 'use-model-for-both-roles').click();
    await vi.waitFor(() => expect(calls.selectProModel).toHaveBeenCalledWith({ route: 'anthropic-claude', modelId, reasoningEffort: 'off' }));
  });

  it('restores the selected model and filter after channel round trips, refresh and two changed polls', async () => {
    setTechnicalLayerVisible(false);
    const projection = completeSettings();
    const calls = api(projection);
    const { screen, node, poll } = mountSettings(calls);
    try {
      await screen.renderModelServiceSettings();
      const modelId = projection.channels.find((channel) => channel.channelId === 'opencode-go')!.models.at(-1)!.modelId;
      const model = node.querySelector('select[aria-label="AI7 使用的模型"]')!;
      model.value = modelId; model.dispatchEvent({ type: 'change' });
      const filter = node.querySelector('input[aria-label="筛选模型"]')!;
      filter.value = 'missing'; filter.dispatchEvent({ type: 'input' });
      const channel = node.querySelector('select[aria-label="渠道"]')!;
      for (const id of ['anthropic-claude', 'opencode-go']) { channel.value = id; channel.dispatchEvent({ type: 'change' }); }
      const assertChoice = () => {
        expect(node.querySelector('select[aria-label="AI7 使用的模型"]')!.value).toBe(modelId);
        expect(node.querySelector('input[aria-label="筛选模型"]')!.value).toBe('missing');
      };
      assertChoice();
      const refreshed = structuredClone(projection);
      Object.assign(refreshed.channels.find((item) => item.channelId === 'opencode-go')!, { models: [...projection.channels.find((item) => item.channelId === 'opencode-go')!.models].reverse() });
      vi.mocked(calls.refreshModelServiceModels).mockResolvedValue({ ...refreshed, modelDiscovery: { status: 'success', modelCount: 150 } });
      const beforeRefresh = node.querySelector('[data-model-service-flow]');
      button(node, 'retry-model-list').click();
      await vi.waitFor(() => expect(node.querySelector('[data-model-service-flow]') === beforeRefresh).toBe(false));
      assertChoice();
      for (let cycle = 1; cycle <= 2; cycle++) {
        const changed = structuredClone(projection);
        Object.assign(changed.channels[0]!, { channelLabel: `changed ${cycle}` });
        vi.mocked(calls.getModelServiceSettings).mockResolvedValue(changed);
        const before = node.querySelector('[data-model-service-flow]');
        poll();
        await vi.waitFor(() => expect(node.querySelector('[data-model-service-flow]') === before).toBe(false));
        assertChoice();
      }
      expect(node.querySelectorAll('[data-model-role]')).toHaveLength(0);
    } finally { vi.unstubAllGlobals(); }
  });

  it('saves favourites through preferences while retaining other channel choices', async () => {
    setTechnicalLayerVisible(false);
    const calls = api(completeSettings());
    let values: PreferenceValues = { ...preferenceDefaults(), 'model.favourites': { 'anthropic-claude': ['shared-id'] } };
    calls.getPreferences = vi.fn(async () => ({ version: 1 as const, values, notice: null }));
    calls.savePreference = vi.fn(async (input) => { values = { ...values, [input.key]: input.value }; return { version: 1 as const, values, notice: null }; });
    const { screen, node } = mountSettings(calls);
    try {
      await screen.renderModelServiceSettings();
      node.querySelector('[data-favorite-model]')!.click();
      await vi.waitFor(() => expect(calls.savePreference).toHaveBeenCalledWith({ key: 'model.favourites', value: {
        'anthropic-claude': ['shared-id'], 'opencode-go': ['deepseek-v4.1-flash'],
      } }));
      await screen.renderModelServiceSettings();
      expect(node.querySelector('[data-favorite-model]')!.getAttribute('aria-pressed')).toBe('true');
      node.querySelector('[data-favorite-model]')!.click();
      await vi.waitFor(() => expect(values['model.favourites']['opencode-go']).toEqual([]));
    } finally { vi.unstubAllGlobals(); }
  });
  it.each([false, true])('keeps manual refresh available with ready credentials (technical=%s)', async (technical) => {
    setTechnicalLayerVisible(technical);
    const projection = settings(['opencode-go']);
    const calls = api({ ...projection, modelDiscovery: { status: 'success', modelCount: 150 } });
    const { node, render } = flow(projection, calls);
    const refresh = button(node, 'retry-model-list');
    expect([refresh.textContent, refresh.disabled]).toEqual(['刷新模型列表', false]);
    refresh.click();
    await vi.waitFor(() => expect(render).toHaveBeenCalled());
    expect(calls.refreshModelServiceModels).toHaveBeenCalledWith({ route: 'opencode-go' });
    expect(button(flow(settings([])).node, 'retry-model-list').disabled).toBe(true);
  });

  it.each([false, true])('filters 150 models by name and ID without dropping selection (technical=%s)', async (technical) => {
    setTechnicalLayerVisible(technical);
    const projection = settings(['opencode-go']);
    const channel = projection.channels.find((item) => item.channelId === 'opencode-go')!;
    Object.assign(channel, { models: Array.from({ length: 150 }, (_, index) => ({ ...channel.models[0]!, modelId: `model-${index}`, modelLabel: `目录模型 ${index}` })) });
    const favourites = { 'opencode-go': ['model-149'] };
    const toggleFavourite = vi.fn(async () => ({ 'opencode-go': ['model-149', 'model-148'] }));
    const { node, calls } = flow(projection, api(), { modelId: 'model-42', favourites, toggleFavourite });
    const selector = node.querySelector('select[aria-label="AI7 使用的模型"]');
    expect(technical ? node.querySelectorAll('[data-model-choice]')[0]!.value : selector!.children[0]!.value).toBe('model-149');
    const filter = node.querySelector('input[aria-label="筛选模型"]')!;
    for (const query of ['目录模型 149', 'model-149', '不存在', '']) {
      filter.value = query; filter.dispatchEvent({ type: 'input' });
      if (query === 'model-149' || query === '目录模型 149') {
        if (technical) expect(node.querySelectorAll('.model-service-catalogue-row').filter((row) => !row.hidden)).toHaveLength(1);
        else expect(selector!.children.map((option) => option.value)).toEqual(['model-149', 'model-42']);
      }
      if (technical) expect(node.querySelector('[data-model-choice="model-42"]')!.checked).toBe(true);
      else expect(selector!.value).toBe('model-42');
    }
    if (technical) node.querySelector('[data-favorite-model="model-148"]')!.click();
    else { selector!.value = 'model-148'; selector!.dispatchEvent({ type: 'change' }); node.querySelector('[data-favorite-model="model-148"]')!.click(); }
    await vi.waitFor(() => expect(toggleFavourite).toHaveBeenCalledWith('opencode-go', 'model-148'));
    await vi.waitFor(() => expect(node.querySelector('[data-favorite-model="model-148"]')!.getAttribute('aria-pressed')).toBe('true'));
    button(node, 'use-model-for-both-roles').click();
    await vi.waitFor(() => expect(calls.selectProModel).toHaveBeenCalledWith({ route: 'opencode-go', modelId: technical ? 'model-42' : 'model-148', reasoningEffort: 'off' }));
  });
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
        document.body.replaceChildren(root); // the shell's screen is in the document; a page off screen takes no late repaint (#1445)
        const page = root as unknown as MiniElement;
        const screen = createModelServiceSettings({ element, panel: () => element('section'), setStatus: vi.fn(), initializeStartup: vi.fn(),
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
        model.value = model.querySelectorAll('option').at(-1)!.value; model.dispatchEvent({ type: 'change' });
        button(page, 'use-model-for-both-roles').click();
        await vi.waitFor(() => expect(calls.selectProModel).toHaveBeenCalledWith({ route, modelId: model.value, reasoningEffort: 'off' }));
        await vi.waitFor(() => expect(page.querySelector('select[aria-label="AI7 使用的模型"]')!.value).toBe(model.value));
        button(page, 'test-flow-connection').click();
        await vi.waitFor(() => expect(calls.testModelServiceConnection).toHaveBeenCalledWith({ route, modelId: model.value, reasoningEffort: 'off' }));
      } finally { vi.unstubAllGlobals(); setTechnicalLayerVisible(true); }
    });

  it('saves and removes credentials inline, including a channel with an empty catalogue', async () => {
    const projection = settings([], null);
    const zen = projection.channels.find((channel) => channel.channelId === 'opencode-zen')!;
    Object.assign(zen, { models: [] });
    const { node, calls, render } = flow(projection);
    pickChannel(node, 'opencode-zen');
    expect(node.querySelectorAll('select')).toHaveLength(3);
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
  it.each([true])('chooses a custom ID independently for either role (technical=%s)', async (technical) => {
    setTechnicalLayerVisible(technical);
    const { node, calls } = flow(settings(['anthropic-claude']));
    const custom = node.querySelector('[data-custom-model-id]')!;
    custom.value = 'account/custom-opus'; custom.dispatchEvent({ type: 'input' });
    button(node, 'use-model-for-both-roles').click();
    await vi.waitFor(() => expect(calls.selectProModel).toHaveBeenCalledWith({ route: 'anthropic-claude', modelId: 'account/custom-opus', reasoningEffort: 'off' }));
    const flashCustom = node.querySelector('[data-custom-flash-model-id]')!; flashCustom.value = 'account/custom-opus'; flashCustom.dispatchEvent({ type: 'input' });
    button(node, 'select-fast-role-model').click();
    await vi.waitFor(() => expect(calls.selectFlashModel).toHaveBeenCalledWith({ route: 'anthropic-claude', modelId: 'account/custom-opus', reasoningEffort: 'off' }));
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
    const reason = '模型服务不可达，请检查网络或网络代理设置';
    const projection = { ...settings(['deepseek-open-platform']),
      routeChoice: { ...settings(['deepseek-open-platform']).routeChoice, unsupportedProviders: [] },
      proxy: { mode: 'direct' }, lastProxyProbe: null, searchBackends: { backends: [], candidates: [] },
      protectedSecretStore: { label: '合成凭据库', availability: 'available' }, authorityStatement: '合成设置',
      modelDiscovery: { status: 'failure', code: 'MODEL_SERVICE_UNREACHABLE', reason },
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
      const screen = createModelServiceSettings({ element, panel: () => element('section'), setStatus, initializeStartup: vi.fn(),
        button: (label, className, action) => { const node = element('button', className, label); node.addEventListener('click', () => void action()); return node; },
        rendererErrorMessage: (_error, fallback) => fallback, replaceScreen });
      await screen.renderModelServiceSettings();
      const page = root as unknown as MiniElement;
      const secret = page.querySelectorAll('input').find((input) => input.type === 'password')!;
      secret.value = 'synthetic-key'; secret.dispatchEvent({ type: 'input' });
      page.querySelector('.model-credential-form')!.dispatchEvent({ type: 'submit' });
      await vi.waitFor(() => expect(setStatus).toHaveBeenLastCalledWith(`密钥已保存，但无法获取模型列表：${reason}`, 'error'));
      // The real visibility listener follows settings after role choices return to their original values.
      (document.body as unknown as MiniElement).dispatchEvent({ type: 'visibilitychange' });
      await vi.waitFor(() => expect(calls.refreshModelServiceModels).toHaveBeenCalledOnce());
      expect(setStatus).toHaveBeenLastCalledWith(reason, 'error');
      const technical = root.querySelector<HTMLDetailsElement>('.model-service-technical')!;
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
    await vi.waitFor(() => expect(setStatus).toHaveBeenCalledWith('密钥已保存，但无法获取模型列表：模型服务拒绝了凭据', 'error'));
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
    const calls = { ...api(projection), getModelServiceSettings: vi.fn(async () => projection), saveModelServiceProxy: vi.fn(async () => projection) };
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
      const screen = createModelServiceSettings({ element, panel: () => element('section'), setStatus, initializeStartup,
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
      expect(page.textContent).not.toContain('合成设置');
      calls.getModelServiceSettings.mockResolvedValue({ ...projection, launchPolicy: { ...projection.launchPolicy,
        integrityState: 'denied', denialReason: 'binding-not-allowed' } });
      await screen.renderModelServiceSettings();
      expect(page.querySelector('[data-policy-integrity-state]')?.textContent).toBe('当前模型连接不在允许范围内。');
      setTechnicalLayerVisible(true);
      expect(page.querySelectorAll('button').some((node) => node.textContent === '返回')).toBe(false);
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
    expect(Array.from(node.querySelectorAll('[data-model-choice]'), (choice) => choice.dataset['modelChoice'])).toEqual(expect.arrayContaining([
      'gpt-5.6-sol', 'gpt-5.6-luna', 'gpt-6.2-sol', 'gpt-6.1-terra',
    ]));
  });

  it('sets both roles through the existing route and Fast choices, and renders the settings that answer', async () => {
    const answer = settings(['opencode-go', 'deepseek-open-platform'], 'deepseek-open-platform');
    const { node, render, calls } = flow(settings(['opencode-go', 'deepseek-open-platform'], 'opencode-go'), api(answer));
    pickChannel(node, 'deepseek-open-platform');
    const use = button(node, 'use-model-for-both-roles');
    expect([use.disabled, use.textContent]).toEqual([false, USE_FOR_BOTH_ROLES_LABEL]);
    use.click();
    await vi.waitFor(() => expect(render).toHaveBeenCalledWith(answer));
    expect(calls.selectProModel).toHaveBeenCalledWith({ route: 'deepseek-open-platform', modelId: 'deepseek-flash', reasoningEffort: 'off' });
  });

  it('offers every Claude model without a connection test and saves both bindings atomically', async () => {
    const projection = settings(['opencode-go', 'anthropic-claude'], 'opencode-go');
    const { node, calls } = flow(projection);
    pickChannel(node, 'anthropic-claude');
    expect(modelServiceChoices(projection).filter((choice) => choice.route === 'anthropic-claude').map(choice => choice.modelId).sort()).toEqual([
      'claude-fable-5-1', 'claude-haiku-4-5', 'claude-opus-5', 'claude-opus-5-5', 'claude-sonnet-5', 'claude-sonnet-5-5',
    ]);
    expect(button(node, 'use-model-for-both-roles').disabled).toBe(false);
    button(node, 'use-model-for-both-roles').click();
    await vi.waitFor(() => expect(calls.selectProModel).toHaveBeenCalledWith({ route: 'anthropic-claude', modelId: 'claude-opus-5', reasoningEffort: 'off' }));
    expect(calls.testModelServiceConnection).not.toHaveBeenCalled();
  });

  it('tests the chosen model\'s connection on the existing path and states its declared capabilities', async () => {
    const { node, render, calls } = flow(settings(['opencode-go']));
    expect(node.textContent).toContain('能力：文本回答协议支持 · 流式协议支持 · 工具调用协议支持');
    expect(node.textContent).toContain('尚未测试；保存密钥不等于连接成功');
    button(node, 'test-flow-connection').click();
    await vi.waitFor(() => expect(render).toHaveBeenCalled());
    expect(calls.testModelServiceConnection).toHaveBeenCalledWith({ route: 'opencode-go', modelId: 'deepseek-v4.1-flash', reasoningEffort: 'off' });
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
  const { node, calls } = flow(settings(['opencode-go'], null, null));
  expect(node.querySelectorAll('select')).toHaveLength(5);
  expect(node.querySelector('[data-action="select-main-role-model"]')).toBeNull();
  expect(node.querySelector('[data-action="select-fast-role-model"]')).not.toBeNull();
  expect(node.querySelector('[data-custom-model-id]')).toBeNull();
  expect(node.textContent).toContain('AI7 使用的模型');
  button(node, 'use-model-for-both-roles').click();
  await vi.waitFor(() => expect(calls.selectProModel).toHaveBeenCalledWith({ route: 'opencode-go', modelId: 'deepseek-v4.1-flash', reasoningEffort: 'off' }));
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
    expect(painted.querySelector('[data-connection-test-outcome="passed"]')!.textContent).toBe('连接成功，可以使用。');
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
      const page = createModelServiceSettings({ element, panel: () => element('section'), setStatus: vi.fn(), initializeStartup: vi.fn(),
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


it('offers ready channels, favourites first, and resets the task choice without saving role defaults (#1455)', () => {
  const changed = vi.fn();
  const projection = settings(['opencode-go', 'openai-platform']);
  const chooser = createDispatchChooser({ role: 'main-editorial', changed });
  const goModels = projection.channels.find(channel => channel.channelId === 'opencode-go')!.models;
  // A Go model declared on its /responses route is never offered (#1582): no runtime record serves that route.
  const favourite = goModels.filter(model => model.main !== 'route-not-served').at(-1)!;
  const unserved = goModels.find(model => model.main === 'route-not-served')!;
  const defaults = JSON.stringify(projection.roles);
  chooser.render(projection, { 'opencode-go': [favourite.modelId, unserved.modelId] });
  const root = chooser.element as unknown as MiniElement;
  expect(root.querySelectorAll('option').some(option => option.textContent.includes(unserved.modelLabel))).toBe(false);
  expect(root.querySelectorAll('optgroup').map(group => (group as unknown as { label: string }).label)).toEqual(['OpenCode Go', 'OpenAI 官方']);
  expect(root.querySelectorAll('optgroup')[0]!.children[0]!.textContent).toBe(`★ ${favourite.modelLabel}`);
  const inheritedLabel = root.querySelector('summary')!.textContent;
  const model = root.querySelector('select[aria-label="本次任务的模型"]')!;
  const options = root.querySelectorAll('option');
  expect(options.some(option => option.textContent.includes('★'))).toBe(true);
  Object.assign(model, { selectedIndex: root.querySelectorAll('optgroup')[0]!.children.length });
  model.dispatchEvent({ type: 'change' });
  const effort = root.querySelector('select[aria-label="本次任务的思考强度"]')!;
  const level = effort.children[1]!.value;
  effort.value = level; effort.dispatchEvent({ type: 'change' });
  expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ reasoningEffort: level }));
  expect(root.querySelector('summary')!.textContent).toContain(`@${level}`);
  const selectedLabel = root.querySelector('summary')!.textContent;
  chooser.render(projection, {}, changed.mock.lastCall![0]);
  expect(root.querySelector('summary')!.textContent).toBe(selectedLabel);
  root.querySelector('button')!.click();
  expect(changed).toHaveBeenLastCalledWith({});
  expect(root.querySelector('summary')!.textContent).toBe(inheritedLabel);
  expect(JSON.stringify(projection.roles)).toBe(defaults);
});


it('names the effective models, clears the optional choice, and explains a refused stored model', async () => {
  setTechnicalLayerVisible(false);
  const single = completeSettings();
  const main = single.modelRoles.find(role => role.roleId === 'foreground-pro')!;
  const one = { ...single, modelRoles: single.modelRoles.map(role => ({ ...role, binding: main.binding, source: role.roleId === 'foreground-pro' ? 'pro-tier' as const : 'follows-foreground-pro' as const })) };
  const calls = api(one);
  const { screen, node } = mountSettings(calls);
  try {
    await screen.renderModelServiceSettings();
    expect(node.querySelector('[data-model-summary]')!.textContent).toContain('也使用同一个模型');
    expect(node.textContent).toContain('可选：为较轻的任务另选一个模型');
    const both = { ...one, modelRoles: one.modelRoles.map(role => role.roleId.endsWith('flash') ? { ...role, source: 'flash-tier' as const, binding: { ...main.binding!, modelLabel: '合成轻模型', modelId: 'synthetic-light' } } : role) };
    vi.mocked(calls.getModelServiceSettings).mockResolvedValue(both);
    await screen.renderModelServiceSettings();
    expect(node.querySelector('[data-model-summary]')!.textContent).toContain('合成轻模型');
    button(node, 'clear-flash-model').click();
    await vi.waitFor(() => expect(calls.clearFlashModel).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(node.querySelector('[data-model-summary]')!.textContent).toContain('也使用同一个模型'));
    vi.mocked(calls.getModelServiceSettings).mockResolvedValue({ ...one, modelRoles: one.modelRoles.map(role => ({ ...role, status: 'needs-attention', statusLabel: '需处理', statusDetail: '这个渠道暂时还不能使用这个模型，请换一个模型。这次没有发送任何内容。' })) });
    await screen.renderModelServiceSettings();
    expect(node.textContent).toContain('需处理：这个渠道暂时还不能使用这个模型');
    expect(node.textContent).not.toContain('这次没有发送任何内容');
    expect(node.querySelectorAll('[data-model-summary].attention-note')).toHaveLength(1);
  } finally { vi.unstubAllGlobals(); }
});

it('groups configured recommendations before the remaining models and offers default, suggested and custom effort', () => {
  setTechnicalLayerVisible(false);
  const projection = settings(['anthropic-claude']);
  const { node } = flow(projection);
  expect(node.querySelectorAll('optgroup').map(group => (group as unknown as { label: string }).label).slice(0, 2)).toEqual(['推荐 · 主要模型', '推荐 · 较轻模型']);
  const effort = node.querySelector('select[aria-label="思考强度"]')!;
  expect(effort.querySelectorAll('option').map(option => option.textContent)).toEqual(expect.arrayContaining(['服务默认', '其他…']));
  effort.value = '__other'; effort.dispatchEvent({ type: 'change' });
  expect(node.querySelector('input[data-reasoning-effort="main"]')!.hidden).toBe(false);
  const plain = { ...projection, channels: projection.channels.map(channel => { const { recommended: _recommendations, ...plain } = channel; return plain; }) };
  expect(flow(plain).node.querySelectorAll('optgroup')).toHaveLength(0);
});


it('lets an explicit settings entry reset the previous page scroll instead of restoring it', async () => {
  const { screen, node } = mountSettings(api(completeSettings()));
  Object.defineProperty(document, 'scrollingElement', { configurable: true, value: node });
  try {
    await screen.renderModelServiceSettings();
    node.scrollTop = 240;
    await screen.renderModelServiceSettings();
    expect(node.scrollTop).toBe(0);
  } finally { vi.unstubAllGlobals(); }
});


it('keeps the optional model independent, preserves Flash on main save, and places the summary between choices', async () => {
  setTechnicalLayerVisible(false);
  const projection = settings(['anthropic-claude'], 'anthropic-claude', null);
  const { node, calls } = flow(projection);
  const main = node.querySelector('select[aria-label="AI7 使用的模型"]')!;
  const light = node.querySelector('select[data-flash-model]')!;
  const original = main.value;
  light.value = light.querySelectorAll('option').at(-1)!.value; light.dispatchEvent({ type: 'change' });
  button(node, 'select-fast-role-model').click();
  await vi.waitFor(() => expect(calls.selectFlashModel).toHaveBeenCalledWith(expect.objectContaining({ modelId: light.value })));
  expect(main.value).toBe(original); expect(button(node, 'use-model-for-both-roles').disabled).toBe(true);
  expect(button(node, 'clear-flash-model').disabled).toBe(true);
  setEffort(node, 'main', 'high'); button(node, 'use-model-for-both-roles').click();
  await vi.waitFor(() => expect(calls.selectProModel).toHaveBeenCalledWith(expect.objectContaining({ reasoningEffort: 'high' })));
  expect(calls.selectFlashModel).toHaveBeenCalledTimes(1); expect(calls.clearFlashModel).not.toHaveBeenCalled();
  const actions = button(node, 'use-model-for-both-roles').parentElement!;
  const siblings = actions.parentElement!.children;
  expect(siblings[siblings.indexOf(actions) + 1]!.dataset['modelSummary']).toBe('true');
  expect(siblings[siblings.indexOf(actions) + 2]!.className).toBe('model-service-optional');
});

it('keeps Other open for blank and suggested text and sends the shown dropdown selection', async () => {
  const { node, calls } = flow(settings(['anthropic-claude']));
  const select = node.querySelector('select[aria-label="思考强度"]')!;
  expect(select.querySelectorAll('option').map(option => option.value)).toEqual(expect.arrayContaining(['low', 'high']));
  select.value = '__other'; select.dispatchEvent({ type: 'change' });
  const input = node.querySelector('input[data-reasoning-effort="main"]')!;
  input.value = 'low'; input.dispatchEvent({ type: 'input' });
  expect(select.value).toBe('__other'); expect(input.hidden).toBe(false);
  input.value = ''; input.dispatchEvent({ type: 'input' }); expect(select.value).toBe('__other');
  select.value = 'high'; select.dispatchEvent({ type: 'change' }); expect(input.hidden).toBe(true);
  input.value = 'low'; // A stale text-field restoration must not change the shown selection's request.
  button(node, 'use-model-for-both-roles').click();
  await vi.waitFor(() => expect(calls.selectProModel).toHaveBeenCalledWith(expect.objectContaining({ reasoningEffort: 'high' })));
  expect(node.textContent).toContain('可能不被服务接受');
});

it('shows all four developer roles, their sources and their own effort', async () => {
  setTechnicalLayerVisible(true);
  const base = completeSettings();
  const projection = { ...base, modelRoles: base.modelRoles.map(role => ({ ...role, statusDetail: '这个渠道不能发送所选模型，请换一个模型。这次没有发送任何内容。' })) };
  const { screen, node } = mountSettings(api(projection));
  try {
    await screen.renderModelServiceSettings();
    const rows = node.querySelectorAll('[data-model-role]'); expect(rows).toHaveLength(4);
    for (const [index, role] of projection.modelRoles.entries()) {
      expect(rows[index]!.textContent).toContain(role.roleLabel);
      expect(rows[index]!.textContent).toContain(role.sourceLabel);
      expect(rows[index]!.textContent).toContain('思考强度');
      expect(rows[index]!.textContent).toContain('这个渠道不能发送所选模型，请换一个模型。');
      expect(rows[index]!.textContent).not.toContain('这次没有发送任何内容');
    }
  } finally { vi.unstubAllGlobals(); }
});

it.each(['flash-unavailable-follows-foreground-pro', 'flash-not-served-follows-foreground-pro'] as const)('explains the unused lighter choice (%s) and keeps its connection test', source => {
  setTechnicalLayerVisible(false);
  const projection = settings(['anthropic-claude']);
  const adjusted = { ...projection, modelRoles: projection.modelRoles.map(role => role.roleId === 'foreground-flash' ? { ...role, source } : role) };
  const { node } = flow(adjusted);
  expect(node.querySelector('[data-model-summary]')!.textContent).toContain('单独选择的较轻模型');
  expect(node.querySelector('[data-model-summary]')!.textContent).toContain('现在这些任务使用主要模型');
  expect(button(node, 'clear-flash-model').disabled).toBe(false);
  expect(button(node, 'test-fast-flow-connection').hidden).toBe(false);
});

it.each(['setup-required', 'needs-attention', 'unavailable'] as const)('does not claim an unusable main model is in use (%s)', status => {
  setTechnicalLayerVisible(false);
  const projection = settings(['anthropic-claude']);
  const { node } = flow({ ...projection, modelRoles: projection.modelRoles.map(role => role.roleId === 'foreground-pro' ? { ...role, status } : role) });
  expect(node.querySelector('[data-model-summary]')!.textContent).not.toContain('AI7 当前使用');
  expect(node.querySelector('[data-model-summary]')!.textContent).toContain(status === 'unavailable' ? '系统的安全存储暂不可用' : '模型');
});

it('tests the optional model with its own selected model and effort', async () => {
  setTechnicalLayerVisible(false);
  const { node, calls } = flow(settings(['anthropic-claude']));
  const select = node.querySelector('select[data-flash-model]')!;
  select.value = select.querySelectorAll('option').at(-1)!.value; select.dispatchEvent({ type: 'change' });
  setEffort(node, 'fast', 'low'); button(node, 'test-fast-flow-connection').click();
  await vi.waitFor(() => expect(calls.testModelServiceConnection).toHaveBeenCalledWith({ route: 'anthropic-claude', modelId: select.value, reasoningEffort: 'low' }));
});


it('starts the optional effort at service default when no lighter model is chosen', async () => {
  const projection = settings(['anthropic-claude'], 'anthropic-claude', null);
  const { node, calls } = flow({ ...projection, modelRoles: projection.modelRoles.map(role => ({ ...role, binding: role.binding && { ...role.binding, reasoningEffort: 'high' } })) });
  expect(node.querySelector('select[aria-label="思考强度"]')!.value).toBe('high');
  expect(node.querySelector('select[aria-label="较轻模型的思考强度"]')!.value).toBe('');
  expect(node.querySelector('[data-action="test-fast-flow-connection"]')).toBeNull();
  button(node, 'select-fast-role-model').click();
  await vi.waitFor(() => expect(calls.selectFlashModel).toHaveBeenCalledWith(expect.objectContaining({ reasoningEffort: 'off' })));
});


it('keeps favourite and unmatched-selection marks on a recommended option', () => {
  setTechnicalLayerVisible(false);
  const projection = settings(['anthropic-claude']);
  const id = projection.modelRoles.find(role => role.roleId === 'foreground-pro')!.binding!.modelId;
  const { node } = flow(projection, api(), { favourites: { 'anthropic-claude': [id] }, filter: 'no-matching-model' });
  const selected = node.querySelectorAll('optgroup option').find(option => option.value === id)!;
  expect(selected.textContent).toContain('★');
  expect(selected.textContent).toContain('已选（不匹配筛选）');
});


it('uses the configured lighter recommendation and labels its developer custom field', () => {
  const projection = settings(['anthropic-claude'], 'anthropic-claude', null);
  const channel = projection.channels.find(item => item.route === 'anthropic-claude')!;
  const recommended = channel.models.at(-1)!.modelId;
  const { node } = flow({ ...projection, channels: projection.channels.map(item => item === channel ? { ...item, recommended: { pro: [], flash: [recommended] } } : item) });
  expect(node.querySelector('select[data-flash-model]')!.value).toBe(recommended);
  expect(node.querySelector('[data-custom-flash-model-id]')!.parentElement!.textContent).toContain('手动输入较轻模型 ID');
});

it('drops unsaved lighter selection and Other mode on explicit re-entry, without rendering an empty ordinary role section', async () => {
  setTechnicalLayerVisible(false);
  const { screen, node } = mountSettings(api(completeSettings()));
  try {
    await screen.renderModelServiceSettings();
    const chosen = node.querySelector('select[data-flash-model]')!.value;
    const select = node.querySelector('select[data-flash-model]')!;
    select.value = select.querySelectorAll('option').at(-1)!.value; select.dispatchEvent({ type: 'change' });
    const effort = node.querySelector('select[aria-label="较轻模型的思考强度"]')!;
    effort.value = '__other'; effort.dispatchEvent({ type: 'change' });
    const other = node.querySelector('input[data-reasoning-effort="fast"]')!; other.value = 'vendor-future-level'; other.dispatchEvent({ type: 'input' });
    await screen.renderModelServiceSettings();
    expect(node.querySelector('select[data-flash-model]')!.value).toBe(chosen);
    expect(node.querySelector('select[aria-label="较轻模型的思考强度"]')!.value).not.toBe('__other');
    expect(node.querySelector('.model-service-current-roles')).toBeNull();
  } finally { vi.unstubAllGlobals(); }
});


it('keeps the selected lighter model connection-test result beside its controls', () => {
  setTechnicalLayerVisible(false);
  const projection = settings(['anthropic-claude']);
  const binding = projection.modelRoles.find(role => role.roleId === 'foreground-flash')!.binding!;
  const route = projection.routeChoice.routes.find(item => item.route === 'anthropic-claude')!;
  Object.assign(route.connection!, { connectionTest: { modelId: binding.modelId, outcome: 'passed', code: null, testedAt: '2026-11-21T00:00:00.000Z', credentialUpdatedAt: '2026-11-21T00:00:00.000Z', verified: 'buffered-text-only' } });
  const { node } = flow(projection);
  expect(node.querySelector('[data-flash-connection-test]')!.textContent).toBe('较轻模型连接成功，可以使用。');
});

// Stage-2 rework (#1547): the sentence under 「使用这个模型」 names only what the editor can do now.
describe('the sentence while no model is chosen (ordinary mode)', () => {
  const noModel = (ready: ReadonlyArray<ModelServiceRouteId>, edit: (projection: ModelServiceSettingsProjection) => ModelServiceSettingsProjection = (projection) => projection) =>
    flow(edit(settings(ready, null)), api(), { channel: 'anthropic-claude' }).node;
  const sentence = (node: MiniElement) => node.querySelector('[data-model-summary]')!.textContent;
  beforeEach(() => setTechnicalLayerVisible(false));

  it('says to save the key in step 2 first while the channel on screen has none', () => {
    const node = noModel([]);
    expect(sentence(node)).toBe('尚未选择模型。请先在上面的「2. 填写密钥并获取模型」里保存这个渠道的密钥，再选择模型并点击「使用这个模型」。');
    expect(node.querySelector('.model-credential-form input')!.disabled).toBe(false);
    expect(node.querySelector('select[aria-label="AI7 使用的模型"]')!.disabled).toBe(true);
    expect(button(node, 'use-model-for-both-roles').disabled).toBe(true);
  });
  it('reads as before once the key is saved and models are listed', () => {
    const node = noModel(['anthropic-claude']);
    expect(sentence(node)).toBe('尚未选择模型，请在上方选择模型并点击「使用这个模型」。');
    expect(node.querySelector('select[aria-label="AI7 使用的模型"]')!.disabled).toBe(false);
    expect(button(node, 'use-model-for-both-roles').disabled).toBe(false);
  });
  it('points at 刷新模型列表 when the key is saved but no model is listed yet', () => {
    const node = noModel(['anthropic-claude'], (projection) => ({ ...projection, channels: projection.channels.map((channel) => channel.channelId === 'anthropic-claude' ? { ...channel, models: [] } : channel) }));
    expect(sentence(node)).toBe('尚未选择模型。模型列表还没有取到，请先点击上面的「刷新模型列表」，取到后选择模型并点击「使用这个模型」。');
    expect(button(node, 'retry-model-list').disabled).toBe(false);
  });
  it('sends the editor to 渠道 when the channel on screen is not connected in this version', () => {
    const node = noModel([], (projection) => ({ ...projection, routeChoice: { ...projection.routeChoice, routes: projection.routeChoice.routes.filter((option) => option.route !== 'anthropic-claude') } }));
    expect(sentence(node)).toBe('尚未选择模型。这个渠道暂时还不能使用，请先在上面的「1. 渠道」里选择其他渠道。');
  });
});

// Stage-2 rework (#1547): the models no recommendation names follow a heading of their own, as in developer mode.
describe('the ordinary model list headings', () => {
  const model = (modelId: string) => ({ modelId, modelLabel: modelId, family: 'synthetic', main: 'eligible', fast: 'eligible', capabilities: { text: 'supported', stream: 'supported', functionTools: 'supported' } });
  const groups = (recommended: { pro: string[]; flash: string[] } | undefined) => {
    setTechnicalLayerVisible(false);
    const projection = settings(['anthropic-claude']);
    const channels = projection.channels.map((channel) => {
      if (channel.channelId !== 'anthropic-claude') return channel;
      const { recommended: _own, ...plain } = channel;
      return { ...plain, models: ['a', 'b', 'c', 'd'].map(model), ...(recommended === undefined ? {} : { recommended }) } as typeof channel;
    });
    const node = flow({ ...projection, channels }, api(), { channel: 'anthropic-claude' }).node;
    return node.querySelectorAll('optgroup').map((group) => ({ label: (group as unknown as { label: string }).label, models: group.children.map((option) => option.value) }));
  };

  it('puts the remaining models under 其他模型 after the recommended groups', () => {
    expect(groups({ pro: ['a'], flash: ['b'] })).toEqual([
      { label: '推荐 · 主要模型', models: ['a'] }, { label: '推荐 · 较轻模型', models: ['b'] }, { label: '其他模型', models: ['c', 'd'] }]);
  });
  it('draws no 其他模型 when every model is recommended, and no group at all when none is', () => {
    expect(groups({ pro: ['a', 'b'], flash: ['c', 'd'] }).map((group) => group.label)).toEqual(['推荐 · 主要模型', '推荐 · 较轻模型']);
    expect(groups(undefined)).toEqual([]);
  });
});

