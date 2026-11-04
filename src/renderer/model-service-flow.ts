import { technicalLayerVisible, modelLabelWords } from './technical-layer.js';
import {
  MODEL_SERVICE_ROUTE_EFFECT_LABEL,
  type ModelServiceChannelId,
  type ModelServiceChannelModelProjection,
  type ModelServiceChannelProjection,
  type ModelServiceModelDisposition,
  type ModelServiceRouteId,
  type ModelServiceSettingsProjection,
  type RendererApi,
} from '../shared/protocol.js';
import { modelConnectionTestDisclosure, modelConnectionTestFeedback, modelConnectionTestLabel } from './model-service-roles.js';

/** Model settings chooses independent role bindings from the account catalogue or a custom model ID. */
export type ModelServiceFlowApi = Pick<RendererApi, 'saveModelServiceCredential' | 'removeModelServiceCredential' | 'selectMainRoleModel' | 'selectFastRoleModel' | 'selectBothRoleModels' | 'refreshModelServiceModels' | 'testModelServiceConnection'>;

export interface ModelServiceFlowOptions {
  readonly api: ModelServiceFlowApi;
  render(next: ModelServiceSettingsProjection): void;
  setStatus(message: string, tone?: 'busy' | 'success' | 'error'): void;
  errorMessage(error: unknown, fallback: string): string;
  /** The channel last chosen on this settings screen, kept across its repaints; `null` opens on the channel in use. */
  readonly channel: ModelServiceChannelId | null;
  chooseChannel(channel: ModelServiceChannelId): void;
  readonly modelId?: string;
  chooseModel?(modelId: string): void;
}

/** One model both roles can take now: an eligible declaration on a channel whose credential is ready. */
export interface ModelServiceChoice {
  readonly route: ModelServiceRouteId;
  readonly channelLabel: string;
  readonly modelId: string;
  readonly modelLabel: string;
}

export const USE_FOR_BOTH_ROLES_LABEL = '用于主编辑与快速交互';
export const OPEN_MODEL_SERVICE_LABEL = '打开模型服务设置';

const DISPOSITION_WORDS: Readonly<Record<Exclude<ModelServiceModelDisposition, 'eligible'>, string>> = {
  'family-not-admitted-by-selected-policy': '所选策略未准入此协议',
  'untested:text': '文本回答尚未核验',
  'unsupported:text': '此协议不支持文本回答',
  'channel-not-admitted-by-selected-policy': '当前渠道尚未获准',
};

/** Why a model cannot be chosen for a role, in words with the disposition's name; `可选` when it can. */
export function modelDispositionLabel(disposition: ModelServiceModelDisposition): string {
  return disposition === 'eligible' ? '可选' : `${DISPOSITION_WORDS[disposition]}（${disposition}）`;
}

/** What a model's two dispositions say together, as its line in the list of models that cannot be chosen here. */
export function modelRolesLabel(model: ModelServiceChannelModelProjection): string {
  if (model.main === model.fast) return modelDispositionLabel(model.main);
  return `主编辑角色：${modelDispositionLabel(model.main)}；快速交互角色：${model.fast === 'eligible' ? '可在高级设置中单独指定' : modelDispositionLabel(model.fast)}`;
}

const CAPABILITY_WORDS = { supported: '协议支持', untested: '未核验', unsupported: '不支持' } as const;

/** The declared capabilities of a model, for the one-click feedback beside its connection test. */
export function modelCapabilityLabel(model: ModelServiceChannelModelProjection): string {
  const { text, stream, functionTools } = model.capabilities;
  return `能力：文本回答${CAPABILITY_WORDS[text]} · 流式${CAPABILITY_WORDS[stream]} · 工具调用${CAPABILITY_WORDS[functionTools]}`;
}

const bothEligible = (model: ModelServiceChannelModelProjection): boolean => model.main === 'eligible' && model.fast === 'eligible';

function credentialReady(projection: ModelServiceSettingsProjection, route: ModelServiceRouteId | null): boolean {
  return route !== null && projection.routeChoice.routes.find((option) => option.route === route)?.connection?.credentialOperationState === 'ready';
}

/** Every model both roles can take now, channel by channel, in the flow's order. */
export function modelServiceChoices(projection: ModelServiceSettingsProjection): ModelServiceChoice[] {
  return projection.channels.flatMap((channel) => channel.route === null || !credentialReady(projection, channel.route) ? [] : channel.models
    .filter((model) => bothEligible(model))
    .map((model) => ({ route: channel.route!, channelLabel: channel.channelLabel, modelId: model.modelId, modelLabel: model.modelLabel })));
}

/** The choice both roles hold now, or `null` when they differ or either has none. */
export function currentModelServiceChoice(projection: ModelServiceSettingsProjection): { route: string; modelId: string } | null {
  const binding = (roleId: string) => projection.roles.find((role) => role.roleId === roleId)?.binding ?? null;
  const main = binding('main-editorial');
  const fast = binding('fast-interaction');
  const mainInUse = projection.routeChoice.routes.some((option) => option.inUse);
  if (main === null || fast === null || !mainInUse || main.providerId !== fast.providerId || main.modelId !== fast.modelId) return null;
  return { route: main.providerId, modelId: main.modelId };
}

/** Persist both role bindings atomically, without changing credentials or requiring a connection test. */
export function useForBothRoles(api: Pick<RendererApi, 'selectBothRoleModels'>, choice: Pick<ModelServiceChoice, 'route' | 'modelId'>): Promise<ModelServiceSettingsProjection> {
  return api.selectBothRoleModels({ route: choice.route, modelId: choice.modelId });
}

/** The inline credential fields keep their existing route identities. */
export function credentialFieldId(route: ModelServiceRouteId): string {
  return route === 'deepseek-open-platform' ? 'main-editorial-connection-name' : `main-editorial-${route}-connection-name`;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function initialChannel(projection: ModelServiceSettingsProjection, chosen: ModelServiceChannelId | null): ModelServiceChannelId {
  const inUse = projection.routeChoice.routes.find((option) => option.inUse)?.route;
  const remembered = projection.channels.find((channel) => channel.channelId === chosen);
  return remembered?.channelId ?? projection.channels.find((channel) => channel.route === inUse)?.channelId ?? 'opencode-go';
}

function credentialStep(projection: ModelServiceSettingsProjection, channel: ModelServiceChannelProjection, options: ModelServiceFlowOptions): HTMLElement {
  const step = el('div', 'model-service-flow-step model-route-option');
  step.dataset['flowStep'] = 'credential';
  step.append(el('h4', undefined, '2. 填写凭据并获取模型'));
  const option = channel.route === null ? undefined : projection.routeChoice.routes.find((candidate) => candidate.route === channel.route);
  if (option === undefined) {
    step.append(el('p', 'field-note', '当前版本尚未接入此渠道。'));
    return step;
  }
  step.append(el('p', undefined, option.connection === null ? `${channel.channelLabel}：${option.statusLabel}` : `${channel.channelLabel}：${option.statusLabel} · 连接名称：${option.connection.connectionName}`));
  step.dataset['modelRoute'] = option.route;
  step.dataset['modelRouteStatus'] = option.status;
  const form = el('form', 'model-credential-form');
  const name = el('input'); name.type = 'text'; name.maxLength = 80; name.required = true; name.autocomplete = 'off';
  name.id = credentialFieldId(option.route); name.name = 'connection-name';
  name.value = option.connection?.connectionName ?? channel.channelLabel;
  const nameLabel = el('label', undefined, '连接名称'); nameLabel.htmlFor = name.id; nameLabel.append(name);
  const secret = el('input'); secret.type = 'password'; secret.required = true; secret.autocomplete = 'off'; secret.name = 'credential';
  secret.id = name.id.replace('-connection-name', '-credential');
  const secretLabel = el('label', undefined, option.connection === null ? 'API 凭据' : '填写或更新 API 凭据'); secretLabel.htmlFor = secret.id; secretLabel.append(secret);
  const save = el('button', 'primary', '保存并获取模型'); save.type = 'submit'; save.dataset['action'] = 'save-channel-credential'; save.disabled = true;
  const update = (): void => { save.disabled = secret.value.trim().length === 0 || name.value.trim().length === 0; };
  secret.addEventListener('input', update); name.addEventListener('input', update);
  form.addEventListener('submit', (event) => { event.preventDefault(); void (async () => {
    if (save.disabled) return;
    save.disabled = true;
    const pending = options.api.saveModelServiceCredential({ route: option.route, connectionName: name.value.trim(), secret: secret.value });
    secret.value = '';
    options.setStatus('正在保存凭据并获取模型…', 'busy');
    try {
      const result = await pending;
      options.render(result);
      const discovery = result.modelDiscovery;
      if (discovery?.status === 'failure') options.setStatus(`凭据已保存，但无法获取模型列表：${discovery.reason}`, 'error');
      else options.setStatus(discovery?.status === 'success'
        ? `凭据已保存；已获取 ${discovery.modelCount} 个模型。`
        : '凭据已保存；可选择账号模型或手动输入模型 ID。', 'success');
    }
    catch (error) { update(); options.setStatus(options.errorMessage(error, '无法保存模型服务凭据。'), 'error'); }
  })(); });
  const actions = el('div', 'button-row');
  const ready = credentialReady(projection, channel.route);
  const refresh = el('button', 'secondary', '刷新模型列表'); refresh.type = 'button'; refresh.disabled = !ready; refresh.dataset['action'] = 'refresh-model-list';
  refresh.addEventListener('click', () => void (async () => {
    refresh.disabled = true;
    try {
      const result = await options.api.refreshModelServiceModels({ route: option.route });
      options.render(result);
      const discovery = result.modelDiscovery;
      if (discovery?.status === 'failure') options.setStatus(discovery.reason, 'error');
      else if (discovery?.status === 'success') options.setStatus(`模型列表已刷新，共 ${discovery.modelCount} 个可用模型。`, 'success');
      else options.setStatus('无法获取模型列表。', 'error');
    }
    catch (error) { refresh.disabled = !ready; options.setStatus(options.errorMessage(error, '无法刷新模型列表。'), 'error'); }
  })());
  const remove = el('button', 'quiet', '移除凭据'); remove.type = 'button'; remove.disabled = !ready; remove.dataset['action'] = 'remove-model-service-credential';
  remove.addEventListener('click', () => void (async () => {
    remove.disabled = true;
    try { options.render(await options.api.removeModelServiceCredential({ route: option.route })); options.setStatus('凭据已移除。', 'success'); }
    catch (error) { remove.disabled = !ready; options.setStatus(options.errorMessage(error, '无法移除模型服务凭据。'), 'error'); }
  })());
  actions.append(save, refresh, remove);
  form.append(nameLabel, secretLabel, actions);
  const stored = el('p', 'field-note', `${ready ? '凭据已保存' : '需设置凭据'}；凭据只写入操作系统安全凭据库，保存后不再显示。`);
  stored.dataset['credentialState'] = option.connection?.credentialOperationState ?? 'missing';
  step.append(stored, form);
  return step;
}

function modelStep(projection: ModelServiceSettingsProjection, channel: ModelServiceChannelProjection, options: ModelServiceFlowOptions): HTMLElement {
  const step = el('div', 'model-service-flow-step');
  step.dataset['flowStep'] = 'model';
  step.append(el('h4', undefined, '3. 选择主编辑与快速交互模型'));
  const ready = credentialReady(projection, channel.route);
  const offered = channel.models.filter(bothEligible);
  const current = currentModelServiceChoice(projection);
  const preferred = options.modelId || (current?.route === channel.route ? current.modelId : null);
  const group = el('fieldset', 'model-service-flow-models');
  group.append(el('legend', undefined, '选择模型，再指定使用角色'));
  let checked: ModelServiceChannelModelProjection | null = null;
  let testing = false;
  const feedback = el('div', 'model-service-flow-feedback');
  const test = el('button', 'secondary', '用公开消息测试连接');
  test.type = 'button';
  test.dataset['action'] = 'test-flow-connection';
  const use = el('button', 'primary', USE_FOR_BOTH_ROLES_LABEL);
  use.type = 'button';
  use.dataset['action'] = 'use-model-for-both-roles';
  const customLabel = el('label', undefined, '手动输入模型 ID');
  const custom = el('input');
  custom.type = 'text'; custom.maxLength = 128; custom.dataset['customModelId'] = 'true';
  custom.disabled = !ready;
  customLabel.append(custom);
  const roleButtons: HTMLButtonElement[] = [];
  const paint = (): void => {
    test.disabled = testing || !ready || checked === null;
    use.disabled = !ready || checked === null || (current?.route === channel.route && current.modelId === checked.modelId);
    for (const button of roleButtons) button.disabled = !ready || checked === null;
    const tested = projection.routeChoice.routes.find((option) => option.route === channel.route)?.connection?.connectionTest ?? null;
    const own = tested !== null && tested.modelId === checked?.modelId ? tested : null;
    const note = el('p', 'field-note', checked === null ? '' : `${modelCapabilityLabel(checked).replace(/。$/u, '')}；${modelConnectionTestLabel(own, modelLabelWords(checked)).replace(/。$/u, '')}${own === null ? '。' : '；测试仅核验缓冲文本，不核验工具或流式。'}`);
    if (own !== null) note.dataset['connectionTestOutcome'] = own.outcome;
    feedback.replaceChildren(...(checked === null ? [] : [note, ...modelConnectionTestDisclosure(own)]));
  };
  for (const model of offered) {
    const label = el('label', 'model-service-flow-choice');
    const radio = el('input');
    radio.type = 'radio';
    radio.name = 'model-service-flow-model';
    radio.value = model.modelId;
    radio.disabled = !ready;
    radio.dataset['modelChoice'] = model.modelId;
    const inUse = current?.route === channel.route && current.modelId === model.modelId;
    if (ready && (checked === null || preferred === model.modelId)) { radio.checked = true; checked = model; }
    radio.addEventListener('change', () => { checked = model; custom.value = ''; options.chooseModel?.(model.modelId); paint(); });
    label.append(radio, ` ${modelLabelWords(model)}${inUse ? ' · 当前使用中' : !ready ? ' · 需先保存凭据' : ''}`);
    group.append(label);
  }
  if (offered.length === 0) group.append(el('p', 'field-note', technicalLayerVisible ? '尚未获取模型列表；保存凭据后刷新，或手动输入模型 ID。' : '保存凭据后获取可用模型。'));
  const chooseCustom = (): void => {
    const modelId = custom.value.trim();
    checked = modelId.length === 0 ? null : { modelId, modelLabel: modelId, family: '', main: 'eligible', fast: 'eligible', capabilities: { text: 'supported', stream: 'supported', functionTools: 'supported' } };
    options.chooseModel?.(modelId);
    for (const radio of Array.from(group.querySelectorAll('input'))) radio.checked = false;
    paint();
  };
  custom.addEventListener('input', chooseCustom);
  if (ready && options.modelId && !offered.some((model) => model.modelId === options.modelId)) {
    custom.value = options.modelId; chooseCustom();
  }
  for (const [role, label, select] of [
    ['main', '用于主编辑角色', options.api.selectMainRoleModel],
    ['fast', '用于快速交互角色', options.api.selectFastRoleModel],
  ] as const) {
    const button = el('button', 'secondary', label); button.type = 'button'; button.dataset['action'] = `select-${role}-role-model`;
    button.addEventListener('click', () => void (async () => {
      if (checked === null || channel.route === null) return;
      button.disabled = true;
      try { options.render(await select({ route: channel.route, modelId: checked.modelId })); options.setStatus(`${label}已保存。`, 'success'); }
      catch (error) { paint(); options.setStatus(options.errorMessage(error, '无法保存模型选择。'), 'error'); }
    })());
    roleButtons.push(button);
  }
  test.addEventListener('click', () => void (async () => {
    if (testing || checked === null || channel.route === null) return;
    const model = checked;
    testing = true;
    test.disabled = true;
    options.setStatus('正在测试连接…', 'busy');
    try {
      const next = await options.api.testModelServiceConnection({ route: channel.route, modelId: model.modelId });
      const result = next.routeChoice.routes.find((option) => option.route === channel.route)?.connection?.connectionTest;
      const status = modelConnectionTestFeedback(result?.modelId === model.modelId ? result : null, channel.channelLabel, modelLabelWords(model));
      options.render(next);
      options.setStatus(status.message, status.tone);
    } catch (error) { options.setStatus(options.errorMessage(error, '连接测试没有完成；不会自动重试。'), 'error'); }
    finally { testing = false; paint(); }
  })());
  use.addEventListener('click', () => void (async () => {
    if (checked === null || channel.route === null) return;
    use.disabled = true;
    options.setStatus('正在保存主编辑与快速交互的模型…', 'busy');
    try {
      options.render(await useForBothRoles(options.api, { route: channel.route, modelId: checked.modelId }));
      options.setStatus(`之后开始的任务使用 ${channel.channelLabel} / ${modelLabelWords(checked)}；已在进行的任务不受影响`, 'success');
    } catch (error) { use.disabled = false; options.setStatus(options.errorMessage(error, '无法保存模型选择。'), 'error'); }
  })());
  paint();
  const actions = el('div', 'button-row');
  actions.append(test, ...roleButtons, use);
  step.append(group, ...(technicalLayerVisible ? [customLabel] : []), feedback, actions);
  const others = channel.models.filter((model) => !bothEligible(model));
  if (others.length > 0) {
    const details = el('details', 'model-service-flow-ineligible');
    details.append(el('summary', undefined, `不可在此选择的模型（${others.length}）`));
    const list = el('ul');
    for (const model of others) {
      const item = el('li', undefined, `${modelLabelWords(model)} · ${modelRolesLabel(model)}`);
      item.dataset['modelDisposition'] = model.main;
      list.append(item);
    }
    details.append(list);
    step.append(details);
  }
  return step;
}

/** The flow's section, painted from the settings projection; a channel change repaints its own steps only. */
export function modelServiceFlow(projection: ModelServiceSettingsProjection, options: ModelServiceFlowOptions): HTMLElement {
  const section = el('section', 'review-section model-service-flow');
  section.dataset['modelServiceFlow'] = 'true';
  section.setAttribute('aria-label', '选择模型');
  section.append(el('h3', undefined, '选择模型'), el('p', 'field-note', `主编辑角色与快速交互角色可分别选择模型；${MODEL_SERVICE_ROUTE_EFFECT_LABEL}`));
  const channels = el('fieldset', 'model-service-flow-channels');
  channels.append(el('legend', undefined, '1. 渠道'));
  const steps = el('div');
  let channelId = initialChannel(projection, options.channel);
  const paint = (): void => {
    const channel = projection.channels.find((candidate) => candidate.channelId === channelId)!;
    options.chooseChannel(channelId);
    section.dataset['flowChannel'] = channelId;
    const credential = credentialStep(projection, channel, options);
    const models = modelStep(projection, channel, options);
    const test = models.querySelector('[data-action="test-flow-connection"]');
    if (test !== null) credential.querySelector('.button-row')?.append(test);
    steps.replaceChildren(credential, models);
  };
  const order: readonly ModelServiceChannelId[] = ['opencode-go', 'deepseek-open-platform', 'openai-platform', 'anthropic-claude', 'google-gemini', 'opencode-zen'];
  for (const channel of [...projection.channels].sort((a, b) => order.indexOf(a.channelId) - order.indexOf(b.channelId))) {
    const label = el('label', 'model-service-flow-choice');
    label.dataset['modelChannel'] = channel.channelId;
    label.dataset['channelCredential'] = channel.route === null ? 'none' : credentialReady(projection, channel.route) ? 'ready' : 'required';
    const radio = el('input');
    radio.type = 'radio';
    radio.name = 'model-service-flow-channel';
    radio.value = channel.channelId;
    radio.checked = channel.channelId === channelId;
    radio.addEventListener('change', () => { channelId = channel.channelId; options.chooseChannel(channelId); paint(); });
    const offered = channel.models.filter(bothEligible).length;
    label.append(radio, ` ${channel.channelLabel} · ${offered === 0 ? '暂无可选模型' : channel.route !== null && credentialReady(projection, channel.route) ? '凭据已保存' : '需设置凭据'}`);
    channels.append(label);
  }
  paint();
  section.append(channels, steps);
  return section;
}
