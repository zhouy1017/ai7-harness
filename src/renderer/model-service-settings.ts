import type { ModelServiceRouteOptionProjection, ModelServiceSettingsProjection, ModelServiceChannelId } from '../shared/protocol.js';
import { MODEL_CONNECTION_TEST_NOTE, mainRoleConnectionTest, modelConnectionTestDisclosure, modelConnectionTestLabel } from './model-service-roles.js';
import { modelServiceFlow } from './model-service-flow.js';
import { modelServiceTestRequired } from '../shared/protocol/model-service.js';
import { renderSearchBackendSettings } from './search-backend-settings.js';
import { launchPolicyIntegritySentence } from './plan-preview-labels.js';
import type { ShellPlace } from './shell.js';

/** The shell's helpers and routes used by 模型服务. */
export interface ModelServiceSettingsOptions {
  readonly element: <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) => HTMLElementTagNameMap[K];
  readonly button: (label: string, className: 'primary' | 'secondary' | 'quiet', action: () => void | Promise<void>) => HTMLButtonElement;
  readonly setStatus: (message: string, tone?: 'busy' | 'success' | 'error') => void;
  readonly rendererErrorMessage: (error: unknown, fallback: string) => string;
  readonly panel: () => HTMLElement;
  readonly initializeStartup: () => Promise<void>;
  readonly replaceScreen: (state: string, content: HTMLElement, place?: ShellPlace | null) => void;
}

/** 模型服务, moved verbatim from the shell (Issue #1235). */
export function createModelServiceSettings(options: ModelServiceSettingsOptions) {
  const {
    element, button, setStatus, rendererErrorMessage, panel, initializeStartup, replaceScreen,
  } = options;

  function renderModelServiceProxyBlock(projection: ModelServiceSettingsProjection): HTMLElement {
    const section = element('section', 'review-section');
    section.dataset['modelServiceProxy'] = projection.proxy.mode;
    section.append(element('h3', undefined, '网络代理'));
    const form = element('form');
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
    input.placeholder = 'http://host:port 或 https://host:port';
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
        renderModelServiceSettingsProjection(await window.ai7.saveModelServiceProxy(setting));
        setStatus('网络代理已保存；下一次请求生效。', 'success');
      } catch (error) {
        save.disabled = false;
        setStatus(rendererErrorMessage(error, '无法保存网络代理。'), 'error');
      }
    });
    form.append(mode, input, save);
    section.append(form, element('p', 'field-note', '仅用于获准的模型服务请求。此设备的网络代理设置不随数据库导入、导出或备份迁移。代理认证将在后续版本提供。'));
    return section;
  }

  /**
   * One route of 设置 › 模型服务 (Issue #811): its binding, whether new Tasks use it, and its own connection name and credential.
   * The DeepSeek 开放平台（官方） form keeps the field identities and action words S55a gave it; the Go form names its route.
   */
  function renderModelRouteOption(option: ModelServiceRouteOptionProjection): HTMLElement {
    const official = option.route === 'deepseek-open-platform';
    const section = element('article', 'model-route-option');
    section.dataset['modelRoute'] = option.route;
    section.dataset['modelRouteStatus'] = option.status;
    section.dataset['modelRouteInUse'] = String(option.inUse);
    const heading = element('div', 'model-role-heading');
    const title = element('h5', undefined, `${option.binding.providerLabel} · ${option.binding.modelLabel}`);
    const status = element('span', `status-pill model-status-${option.status}`, option.statusLabel);
    status.setAttribute('aria-label', `${option.binding.providerLabel}：${option.statusLabel}`);
    heading.append(title, status);
    section.append(heading);
    const notes: string[] = [];
    if (option.isDefault) notes.push('默认路线');
    notes.push(option.inUse ? '新任务使用这条路线' : '新任务不使用这条路线');
    section.append(element('p', 'field-note', notes.join(' · ')));
    const prefix = official ? 'main-editorial' : `main-editorial-${option.route}`;
    const suffix = official ? '' : `（${option.binding.providerLabel}）`;
    const form = element('form', 'model-credential-form');
    const nameLabel = element('label', undefined, '连接名称');
    nameLabel.htmlFor = `${prefix}-connection-name`;
    const connectionName = element('input');
    connectionName.id = `${prefix}-connection-name`;
    connectionName.name = 'connection-name';
    connectionName.type = 'text';
    connectionName.maxLength = 80;
    connectionName.required = true;
    connectionName.autocomplete = 'off';
    connectionName.value = option.connection?.connectionName ?? '';
    const credentialLabel = element('label', undefined, option.connection === null ? 'API 凭据' : '重新输入 API 凭据');
    credentialLabel.htmlFor = `${prefix}-credential`;
    const credential = element('input');
    credential.id = `${prefix}-credential`;
    credential.name = 'credential';
    credential.type = 'password';
    credential.required = true;
    credential.autocomplete = 'off';
    credential.setAttribute('aria-describedby', `${prefix}-credential-help`);
    const help = element('p', 'field-note', '凭据只发送到本机主进程并写入操作系统安全凭据库；保存后不会显示、复制或导出。');
    help.id = `${prefix}-credential-help`;
    const save = button(`${option.connection === null ? '保护并保存' : '重新输入'}${suffix}`, 'primary', () => undefined);
    save.type = 'submit';
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      save.disabled = true;
      const pending = window.ai7.saveModelServiceCredential(official
        ? { connectionName: connectionName.value, secret: credential.value }
        : { route: option.route, connectionName: connectionName.value, secret: credential.value });
      credential.value = '';
      setStatus('正在写入操作系统安全凭据库…', 'busy');
      try {
        renderModelServiceSettingsProjection(await pending);
        setStatus('连接名称与凭据保护状态已更新', 'success');
      } catch (error) {
        save.disabled = false;
        setStatus(rendererErrorMessage(error, '无法更新模型服务凭据。'), 'error');
      }
    });
    form.append(nameLabel, connectionName, credentialLabel, credential, help, save);
    section.append(form);
    if (option.connection !== null) {
      const stored = element('p', 'success-note', `连接名称：${option.connection.connectionName} · 凭据值不再显示`);
      stored.dataset['credentialState'] = option.connection.credentialOperationState;
      const actions = element('div', 'button-row');
      if (!option.inUse && option.connection.credentialOperationState === 'ready') {
        const use = button(`改用${option.binding.providerLabel}`, 'secondary', async () => {
          use.disabled = true;
          setStatus('正在切换新任务使用的模型服务路线…', 'busy');
          try {
            renderModelServiceSettingsProjection(await window.ai7.saveModelServiceCredential({ route: option.route, select: true }));
            setStatus('之后开始的任务使用这条路线；已在进行的任务不受影响', 'success');
          } catch (error) {
            use.disabled = false;
            setStatus(rendererErrorMessage(error, '无法切换模型服务路线。'), 'error');
          }
        });
        use.dataset['action'] = 'select-model-service-route';
        actions.append(use);
      }
      const modelLabel = element('label', undefined, '快速交互模型');
      const models = element('select');
      models.dataset['fastModelChoice'] = option.route;
      for (const model of option.models ?? [option.binding]) {
        const item = element('option', undefined, model.modelLabel);
        item.value = model.modelId; item.selected = model.modelId === (option.connection?.connectionTest?.modelId ?? option.binding.modelId);
        models.append(item);
      }
      const testState = option.connection.connectionTest;
      const testedModel = (option.models ?? [option.binding]).find((model) => model.modelId === testState?.modelId)?.modelLabel;
      section.append(element('p', 'field-note', modelConnectionTestLabel(testState, testedModel)), ...modelConnectionTestDisclosure(testState), element('p', 'field-note', MODEL_CONNECTION_TEST_NOTE));
      const test = button('测试文本连接', 'secondary', async () => {
        test.disabled = true;
        try { renderModelServiceSettingsProjection(await window.ai7.testModelServiceConnection({ route: option.route, modelId: models.value })); }
        catch (error) { test.disabled = false; setStatus(rendererErrorMessage(error, '连接测试没有完成；不会自动重试。'), 'error'); }
      });
      test.dataset['action'] = 'test-model-connection';
      const useFast = button('用于快速交互角色', 'secondary', async () => {
        useFast.disabled = true;
        try { renderModelServiceSettingsProjection(await window.ai7.selectFastRoleModel({ route: option.route, modelId: models.value })); }
        catch (error) { useFast.disabled = false; setStatus(rendererErrorMessage(error, '无法保存快速交互模型。'), 'error'); }
      });
      useFast.dataset['action'] = 'select-fast-role-model';
      const ready = option.connection.credentialOperationState === 'ready';
      test.disabled = !ready;
      const updateSelection = (): void => {
        useFast.disabled = !ready || (modelServiceTestRequired(option.route) &&
          (testState?.outcome !== 'passed' || testState.modelId !== models.value || testState.credentialUpdatedAt !== option.connection?.credentialUpdatedAt));
      };
      models.addEventListener('change', updateSelection); updateSelection();
      modelLabel.append(models); actions.append(modelLabel, test, useFast);
      const remove = button(`移除${suffix}`, 'secondary', async () => {
        remove.disabled = true;
        setStatus('正在从操作系统安全凭据库移除凭据…', 'busy');
        try {
          renderModelServiceSettingsProjection(await (official
            ? window.ai7.removeModelServiceCredential()
            : window.ai7.removeModelServiceCredential({ route: option.route })));
          setStatus('凭据已移除；连接保留为需设置状态', 'success');
        } catch (error) {
          remove.disabled = false;
          setStatus(rendererErrorMessage(error, '无法移除模型服务凭据。'), 'error');
        }
      });
      remove.dataset['action'] = 'remove-model-service-credential';
      remove.dataset['modelRoute'] = option.route;
      actions.append(remove);
      section.append(stored, actions);
    }
    return section;
  }

  let modelServiceChannel: ModelServiceChannelId | null = null;

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
      element('p', 'lede', '先选择渠道、凭据与模型；各模型角色的状态、提供方绑定与单独指定在下方高级设置。'),
    );
    // The one flow for both roles (Issue #1215) leads; the per-role cards below are its advanced settings.
    content.append(modelServiceFlow(projection, { api: window.ai7, render: renderModelServiceSettingsProjection, setStatus, errorMessage: rendererErrorMessage,
      channel: modelServiceChannel, chooseChannel: (channel) => { modelServiceChannel = channel; } }),
      element('h3', undefined, '高级设置 · 分别指定模型角色'));
    const roles = element('section', 'model-role-grid');
    roles.setAttribute('aria-label', '模型角色连接状态');
    for (const role of projection.roles) {
      const card = element('article', 'model-role-card');
      card.dataset['modelRole'] = role.roleId;
      card.dataset['modelRoleStatus'] = role.status;
      const heading = element('div', 'model-role-heading');
      const title = element('h3', undefined, role.roleLabel);
      const status = element('span', `status-pill model-status-${role.status}`, role.statusLabel);
      status.setAttribute('role', 'status');
      status.setAttribute('aria-label', `${role.roleLabel}：${role.statusLabel}`);
      heading.append(title, status);
      card.append(heading, element('p', 'field-note', role.purposeLabel), element('p', undefined, role.statusDetail));
      if (role.binding !== null) {
        const details = element('details', 'model-binding-details');
        const summary = element('summary', undefined, '提供方与模型绑定');
        const values = element('dl');
        values.append(
          element('dt', undefined, '提供方'), element('dd', undefined, role.binding.providerLabel),
          element('dt', undefined, '模型'), element('dd', undefined, role.binding.modelLabel),
          element('dt', undefined, '适配器修订'), element('dd', undefined, String(role.binding.adapterRevision)),
          element('dt', undefined, '配置修订'), element('dd', undefined, String(role.binding.configurationRevision)),
          element('dt', undefined, '已批准备用链'), element('dd', undefined, '无'),
        );
        details.append(summary, values);
        card.append(details);
      }
      // The Main Editorial Role's two routes (Issue #811): each its own connection and credential, one in use for new Tasks.
      if (role.roleId === 'main-editorial') {
        const routes = element('section', 'model-route-list');
        routes.setAttribute('aria-label', '模型服务路线');
        routes.append(element('h4', undefined, '模型服务路线'), element('p', 'field-note', projection.routeChoice.effectLabel));
        for (const option of projection.routeChoice.routes) routes.append(renderModelRouteOption(option));
        const mainTest = mainRoleConnectionTest(projection, { api: window.ai7, render: renderModelServiceSettingsProjection, setStatus, errorMessage: rendererErrorMessage });
        card.append(...(mainTest === null ? [] : [mainTest]), routes);
      }
      roles.append(card);
    }
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
        : '策略完整性：验证未通过。Provider Processing 保持拒绝，不会进行模型传输。',
    );
    policyIntegrity.dataset['policyIntegrityState'] = projection.launchPolicy.integrityState;
    policy.append(
      element('h3', undefined, '当前策略边界'),
      policyIntegrity,
      element('p', undefined, projection.launchPolicy.providerProcessing.label),
      element('p', undefined, projection.launchPolicy.externalExport.label),
      element('p', undefined, projection.launchPolicy.publicReleasePermission.label),
      element('p', 'attention-note', projection.authorityStatement),
    );
    const protectedStore = element(
      'p',
      'field-note',
      `安全凭据库：${projection.protectedSecretStore.label} · ${projection.protectedSecretStore.availability === 'available' ? '可用' : '不可用'}。未启用文件或命令行替代存储。`,
    );
    const actions = element('div', 'button-row');
    actions.append(button('返回', 'quiet', () => void initializeStartup()));
    content.append(roles, renderSearchBackendSettings(projection, { api: window.ai7, render: renderModelServiceSettingsProjection, setStatus, errorMessage: rendererErrorMessage }), unsupported, renderModelServiceProxyBlock(projection), policy, protectedStore, actions);
    replaceScreen('model-service', content);
  }

  async function renderModelServiceSettings(): Promise<void> {
    setStatus('正在读取模型服务状态…', 'busy');
    modelServiceChannel = null;
    try {
      renderModelServiceSettingsProjection(await window.ai7.getModelServiceSettings());
      setStatus('模型服务设置已打开');
    } catch (error) {
      setStatus(rendererErrorMessage(error, '无法读取模型服务设置。'), 'error');
    }
  }

  return { renderModelServiceSettings };
}
