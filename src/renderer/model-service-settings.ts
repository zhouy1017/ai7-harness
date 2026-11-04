import { technicalDisclosure, technicalLayerVisible, modelLabelWords } from './technical-layer.js';
import type { ModelServiceSettingsProjection, ModelServiceChannelId } from '../shared/protocol.js';
import { modelServiceFlow } from './model-service-flow.js';
import { renderSearchBackendSettings } from './search-backend-settings.js';
import { launchPolicyIntegritySentence } from './plan-preview-labels.js';
import type { ShellPlace } from './shell.js';

const proxyProbeMessages = {
  available: '代理可用',
  'https-rejected': '代理不接受 HTTPS 连接，请改用 http://host:port',
  'connection-refused': '代理不可达：端口没有在监听',
  'authentication-required': '代理要求认证，当前版本不支持',
  unreachable: '代理不可达：请检查网络代理设置。',
};

function policyDenial(reason: string | null): string {
  if (reason === 'launch-scope-not-selectable') return '当前启动方式不允许使用模型服务。';
  if (reason === 'binding-not-allowed') return '当前模型连接不在允许范围内。';
  if (reason === 'launch-policy-integrity-denied') return '无法验证当前设置，模型服务不可用。';
  return '模型服务暂不可用，请检查设置后重试。';
}

/** The shell's helpers and routes used by 模型服务. */
export interface ModelServiceSettingsOptions {
  readonly element: <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) => HTMLElementTagNameMap[K];
  readonly button: (label: string, className: 'primary' | 'secondary' | 'quiet', action: () => void | Promise<void>) => HTMLButtonElement;
  readonly setStatus: (message: string, tone?: 'busy' | 'success' | 'error') => void;
  readonly rendererErrorMessage: (error: unknown, fallback: string) => string;
  readonly panel: () => HTMLElement;
  readonly returnToOrigin: () => Promise<void>;
  readonly initializeStartup: () => Promise<void>;
  readonly replaceScreen: (state: string, content: HTMLElement, place?: ShellPlace | null) => void;
}

/** 模型服务, moved verbatim from the shell (Issue #1235). */
export function createModelServiceSettings(options: ModelServiceSettingsOptions) {
  const {
    element, button, setStatus, rendererErrorMessage, panel, initializeStartup, returnToOrigin, replaceScreen,
  } = options;

  function renderModelServiceProxyBlock(projection: ModelServiceSettingsProjection): HTMLElement {
    const section = element('section', 'review-section');
    section.dataset['modelServiceProxy'] = projection.proxy.mode;
    section.append(element('h3', undefined, '网络代理'));
    const form = element('form', 'model-service-proxy-form');
    const mode = element('select');
    mode.setAttribute('aria-label', '网络代理方式');
    for (const [value, label] of [['direct', '不使用代理'], ['proxy', '使用 HTTP(S) 代理']]) {
      const option = element('option', undefined, label);
      option.value = value!;
      mode.append(option);
    }
    mode.value = projection.proxy.mode;
    const input = element('input');
    input.type = 'text';
    input.setAttribute('aria-label', '代理 URL');
    input.placeholder = 'http://127.0.0.1:端口';
    input.autocomplete = 'off';
    input.maxLength = 320;
    input.value = projection.proxy.mode === 'proxy' ? `${projection.proxy.protocol}://${projection.proxy.hostPort}` : '';
    input.disabled = mode.value === 'direct';
    mode.addEventListener('change', () => { input.disabled = mode.value === 'direct'; });
    const save = button('保存网络代理', 'secondary', () => undefined);
    save.type = 'submit';
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        let setting: ModelServiceSettingsProjection['proxy'] = { mode: 'direct' };
        if (mode.value === 'proxy') {
          let url: URL;
          try { url = new URL(input.value); } catch { throw new Error('代理地址必须是 http://host:port 或 https://host:port。'); }
          if (url.username || url.password || input.value.includes('@')) throw new Error('代理地址不能包含用户名或密码；代理认证将在后续版本提供。');
          const authority = /^https?:\/\/([^/?#]+)$/u.exec(input.value);
          if (!authority || !['http:', 'https:'].includes(url.protocol) || !url.hostname ||
              !/^(?:\[[^\]]+\]|[^:]+):[0-9]+$/u.test(authority[1]!)) throw new Error('代理地址必须是 http://host:port 或 https://host:port。');
          const port = Number(authority[1]!.slice(authority[1]!.lastIndexOf(':') + 1));
          if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('代理端口必须在 1 到 65535 之间。');
          setting = { mode: 'proxy', protocol: url.protocol === 'http:' ? 'http' : 'https', hostPort: `${url.hostname}:${port}` };
        }
        save.disabled = true;
        setStatus('正在保存并探测网络代理…', 'busy');
        const saved = await window.ai7.saveModelServiceProxy({ ...setting, ...(setting.mode === 'proxy' && modelServiceChannel !== null ? { probeRoute: modelServiceChannel } : {}) });
        renderModelServiceSettingsProjection(saved);
        const probe = saved.lastProxyProbe;
        setStatus(setting.mode === 'proxy' && probe ? proxyProbeMessages[probe.status] : '网络代理已保存；下一次请求生效。',
          setting.mode === 'proxy' && probe && probe.status !== 'available' ? 'error' : 'success');
      } catch (error) {
        save.disabled = false;
        setStatus(rendererErrorMessage(error, '无法保存网络代理。'), 'error');
      }
    });
    form.append(mode, input, save);
    section.append(form, element('p', 'field-note', '本机代理通常使用 http://127.0.0.1:端口，仅在代理支持 TLS 时使用 https://；代理只用于获准的模型请求，设置不随数据库迁移，暂不支持代理认证。'));
    if (projection.lastProxyProbe) {
      const probe = projection.lastProxyProbe;
      const line = element('p', probe.status === 'available' ? 'success-note' : 'attention-note',
        `上次探测：${proxyProbeMessages[probe.status]} · ${new Date(probe.checkedAt).toLocaleString()}（本次会话）`);
      line.dataset['proxyProbeStatus'] = probe.status;
      section.append(line);
    }
    return section;
  }

  let modelServiceChannel: ModelServiceChannelId | null = null;
  const modelChoices = new Map<ModelServiceChannelId, string>();

  function renderModelServiceSettingsProjection(projection: ModelServiceSettingsProjection): void {
    const content = panel();
    content.classList.add('model-service-settings');
    content.dataset['policyIntegrity'] = projection.launchPolicy.integrityState;
    content.dataset['providerTransmissionCount'] = String(
      projection.launchPolicy.providerProcessing.authorizedLiveTransmissionCount,
    );
    content.append(
      element('p', 'section-label', '设置 · 模型服务'),
      element('h2', undefined, '模型服务'),
      element('p', 'lede', '选择渠道，保存凭据并获取模型，再分别指定主编辑与快速交互模型。'),
    );
    content.append(modelServiceFlow(projection, { api: window.ai7, render: renderModelServiceSettingsProjection, setStatus, errorMessage: rendererErrorMessage,
      channel: modelServiceChannel, chooseChannel: (channel) => { modelServiceChannel = channel; },
      get modelId() { return modelServiceChannel === null ? '' : modelChoices.get(modelServiceChannel) ?? ''; },
      chooseModel: (modelId) => { if (modelServiceChannel !== null) modelChoices.set(modelServiceChannel, modelId); } }));
    const currentRoles = element('section', 'model-service-current-roles');
    currentRoles.setAttribute('aria-label', '当前角色模型');
    for (const role of projection.roles.filter((role) => role.roleId === 'main-editorial' || role.roleId === 'fast-interaction')) {
      const line = element('p', undefined, `${role.roleLabel}：${role.binding === null ? '尚未选择' : `${role.binding.providerLabel} / ${modelLabelWords(role.binding)}`} · ${role.statusLabel}`);
      line.dataset['modelRole'] = role.roleId; line.dataset['modelRoleStatus'] = role.status;
      currentRoles.append(line);
    }
    content.append(currentRoles);
    const unsupported = element('section', 'review-section model-unsupported-providers');
    unsupported.dataset['unsupportedProviders'] = 'true';
    unsupported.setAttribute('aria-label', '尚未支持的模型服务');
    const unsupportedList = element('ul');
    for (const provider of projection.routeChoice.unsupportedProviders) {
      const item = element('li', undefined, `${provider.providerLabel} · ${provider.statusLabel}`);
      item.dataset['providerId'] = provider.providerId;
      unsupportedList.append(item);
    }
    unsupported.append(
      element('h3', undefined, '尚未支持'),
      element('p', 'field-note', '这些模型服务已登记，但当前版本不能选择，也不会收到任何内容。'),
      unsupportedList,
    );
    const policy = element('section', 'review-section model-policy-summary');
    const policyIntegrity = element(
      'p',
      projection.launchPolicy.integrityState === 'verified' ? 'success-note' : 'attention-note',
      projection.launchPolicy.integrityState === 'verified'
        ? launchPolicyIntegritySentence(projection.launchPolicy.providerProcessing.label)
        : policyDenial(projection.launchPolicy.denialReason),
    );
    policyIntegrity.dataset['policyIntegrityState'] = projection.launchPolicy.integrityState;
    const authority = element('p', 'attention-note', projection.authorityStatement);
    policy.append(
      element('h3', undefined, '当前策略边界'),
      ...(technicalLayerVisible ? [policyIntegrity] : []),
      element('p', undefined, projection.launchPolicy.providerProcessing.label),
      element('p', undefined, projection.launchPolicy.externalExport.label),
      element('p', undefined, projection.launchPolicy.publicReleasePermission.label),
      ...(technicalLayerVisible ? [authority] : []),
    );
    const protectedStore = element(
      'p',
      'field-note',
      `安全凭据库：${projection.protectedSecretStore.label} · ${projection.protectedSecretStore.availability === 'available' ? '可用' : '不可用'}；未启用文件或命令行替代存储。`,
    );
    const technical = element('details', 'model-service-technical');
    technical.append(element('summary', undefined, '查看技术详情'), unsupported, policy, protectedStore);
    if (projection.modelDiscovery?.status === 'failure') {
      const discovery = element('section', 'model-service-discovery-technical');
      discovery.dataset['modelDiscoveryCode'] = projection.modelDiscovery.code;
      discovery.append(
        element('h3', undefined, '模型列表获取失败'),
        element('p', undefined, `${projection.modelDiscovery.reason.replace(/。$/u, '')}；错误代码：${projection.modelDiscovery.code}`),
      );
      technical.append(discovery);
    }
    const actions = element('div', 'button-row');
    actions.append(button('返回', 'quiet', () => void returnToOrigin()));
    content.append(renderSearchBackendSettings(projection, { api: window.ai7, render: renderModelServiceSettingsProjection, setStatus, errorMessage: rendererErrorMessage }), renderModelServiceProxyBlock(projection),
      ...(technicalLayerVisible ? [] : [policyIntegrity, authority, ...(projection.protectedSecretStore.availability === 'unavailable' ? [element('p', 'attention-note', '系统安全凭据库不可用，无法保存新凭据。')] : [])]),
      technicalDisclosure(technical), actions);
    replaceScreen('model-service', content);
  }

  async function renderModelServiceSettings(): Promise<void> {
    setStatus('正在读取模型服务状态…', 'busy');
    modelServiceChannel = null;
    modelChoices.clear();
    try {
      renderModelServiceSettingsProjection(await window.ai7.getModelServiceSettings());
      setStatus('模型服务设置已打开');
    } catch (error) {
      setStatus(rendererErrorMessage(error, '无法读取模型服务设置。'), 'error');
    }
  }

  return { renderModelServiceSettings };
}
