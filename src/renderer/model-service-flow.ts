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
import { MODEL_CONNECTION_TEST_NOTE, modelConnectionTestDisclosure, modelConnectionTestLabel } from './model-service-roles.js';

/**
 * 设置 › 模型服务's one flow for the Main Editorial Role and the Fast Interaction Role together (ADR 0094 §1; Issue #1215):
 * a channel, its protected credential and connection test, then a model the channel declares. A model is offered only when
 * it is eligible for both roles and the channel's credential is ready; every other declared model is listed with its
 * disposition by name and offers nothing to choose. Choosing changes configuration only: the Main role through the existing
 * route choice, the Fast role through its existing model choice. The per-role cards below stay the advanced settings.
 */
export type ModelServiceFlowApi = Pick<RendererApi, 'saveModelServiceCredential' | 'selectFastRoleModel' | 'testModelServiceConnection'>;

export interface ModelServiceFlowOptions {
  readonly api: ModelServiceFlowApi;
  render(next: ModelServiceSettingsProjection): void;
  setStatus(message: string, tone?: 'busy' | 'success' | 'error'): void;
  errorMessage(error: unknown, fallback: string): string;
  /** The channel last chosen on this settings screen, kept across its repaints; `null` opens on the channel in use. */
  readonly channel: ModelServiceChannelId | null;
  chooseChannel(channel: ModelServiceChannelId): void;
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
  'not-in-runtime-model-table': '尚无已审核的运行配置',
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

const CAPABILITY_WORDS = { supported: '已核验', untested: '未核验', unsupported: '不支持' } as const;

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
    .filter(bothEligible).map((model) => ({ route: channel.route!, channelLabel: channel.channelLabel, modelId: model.modelId, modelLabel: model.modelLabel })));
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

/** Both roles onto one choice: the Main role's route, then the Fast role's model on it; the settings that answer the last. */
export async function useForBothRoles(api: Pick<RendererApi, 'saveModelServiceCredential' | 'selectFastRoleModel'>, choice: Pick<ModelServiceChoice, 'route' | 'modelId'>): Promise<ModelServiceSettingsProjection> {
  await api.saveModelServiceCredential({ route: choice.route, select: true });
  return api.selectFastRoleModel({ route: choice.route, modelId: choice.modelId });
}

/** The id of a route's 连接名称 field in its advanced card (the official route keeps the ids S55a gave it). */
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

function credentialStep(projection: ModelServiceSettingsProjection, channel: ModelServiceChannelProjection): HTMLElement {
  const step = el('div', 'model-service-flow-step');
  step.dataset['flowStep'] = 'credential';
  step.append(el('h4', undefined, '2. 凭据与连接测试'));
  const option = channel.route === null ? undefined : projection.routeChoice.routes.find((candidate) => candidate.route === channel.route);
  if (option === undefined) {
    step.append(el('p', 'field-note', '此渠道当前没有可选的模型，因此不提供凭据保存；不会向它发送任何内容。'));
    return step;
  }
  step.append(el('p', undefined, option.connection === null ? `${channel.channelLabel}：${option.statusLabel}` : `${channel.channelLabel}：${option.statusLabel} · 连接名称：${option.connection.connectionName}`));
  const enter = el('button', 'secondary', option.connection === null ? '填写凭据' : '重新输入凭据');
  enter.type = 'button';
  enter.dataset['action'] = 'enter-channel-credential';
  enter.addEventListener('click', () => {
    const field = document.getElementById(credentialFieldId(option.route));
    field?.scrollIntoView({ block: 'center' });
    field?.focus();
  });
  step.append(el('p', 'field-note', '凭据在下方高级设置的渠道卡片中填写，只写入操作系统安全凭据库，保存后不再显示。'), enter);
  return step;
}

function modelStep(projection: ModelServiceSettingsProjection, channel: ModelServiceChannelProjection, options: ModelServiceFlowOptions): HTMLElement {
  const step = el('div', 'model-service-flow-step');
  step.dataset['flowStep'] = 'model';
  step.append(el('h4', undefined, '3. 模型'));
  const ready = credentialReady(projection, channel.route);
  const offered = channel.models.filter(bothEligible);
  const current = currentModelServiceChoice(projection);
  const group = el('fieldset', 'model-service-flow-models');
  group.append(el('legend', undefined, '主编辑与快速交互共用的模型'));
  let checked: ModelServiceChannelModelProjection | null = null;
  const feedback = el('div', 'model-service-flow-feedback');
  const test = el('button', 'secondary', '测试连接');
  test.type = 'button';
  test.dataset['action'] = 'test-flow-connection';
  const use = el('button', 'primary', USE_FOR_BOTH_ROLES_LABEL);
  use.type = 'button';
  use.dataset['action'] = 'use-model-for-both-roles';
  const paint = (): void => {
    test.disabled = !ready || checked === null;
    use.disabled = !ready || checked === null || (current?.route === channel.route && current.modelId === checked.modelId);
    const tested = projection.routeChoice.routes.find((option) => option.route === channel.route)?.connection?.connectionTest ?? null;
    const own = tested !== null && tested.modelId === checked?.modelId ? tested : null;
    feedback.replaceChildren(...(checked === null ? [] : [
      el('p', 'field-note', modelCapabilityLabel(checked)),
      el('p', 'field-note', modelConnectionTestLabel(own, checked.modelLabel)), ...modelConnectionTestDisclosure(own),
    ]));
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
    if (ready && (checked === null || inUse)) { radio.checked = true; checked = model; }
    radio.addEventListener('change', () => { checked = model; paint(); });
    label.append(radio, ` ${model.modelLabel}${inUse ? ' · 当前使用中' : ready ? '' : ' · 需先保存凭据'}`);
    group.append(label);
  }
  if (offered.length === 0) group.append(el('p', 'field-note', '此渠道没有两个角色都可选的模型。'));
  test.addEventListener('click', () => void (async () => {
    if (checked === null || channel.route === null) return;
    test.disabled = true;
    try { options.render(await options.api.testModelServiceConnection({ route: channel.route, modelId: checked.modelId })); }
    catch (error) { test.disabled = false; options.setStatus(options.errorMessage(error, '连接测试没有完成；不会自动重试。'), 'error'); }
  })());
  use.addEventListener('click', () => void (async () => {
    if (checked === null || channel.route === null) return;
    use.disabled = true;
    options.setStatus('正在保存主编辑与快速交互的模型…', 'busy');
    try {
      options.render(await useForBothRoles(options.api, { route: channel.route, modelId: checked.modelId }));
      options.setStatus(`之后开始的任务使用 ${channel.channelLabel} / ${checked.modelLabel}；已在进行的任务不受影响`, 'success');
    } catch (error) { use.disabled = false; options.setStatus(options.errorMessage(error, '无法保存模型选择；请在高级设置中查看两个角色的当前模型。'), 'error'); }
  })());
  paint();
  const actions = el('div', 'button-row');
  actions.append(test, use);
  step.append(group, feedback, el('p', 'field-note', MODEL_CONNECTION_TEST_NOTE), actions);
  const others = channel.models.filter((model) => !bothEligible(model));
  if (others.length > 0) {
    const details = el('details', 'model-service-flow-ineligible');
    details.append(el('summary', undefined, `不可在此选择的模型（${others.length}）`));
    const list = el('ul');
    for (const model of others) {
      const item = el('li', undefined, `${model.modelLabel} · ${modelRolesLabel(model)}`);
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
  section.append(el('h3', undefined, '选择模型'), el('p', 'field-note', `主编辑角色与快速交互角色使用同一渠道与模型。${MODEL_SERVICE_ROUTE_EFFECT_LABEL}选择模型不授予读取来源、处理、应用或发布的权限。`));
  const channels = el('fieldset', 'model-service-flow-channels');
  channels.append(el('legend', undefined, '1. 渠道'));
  const steps = el('div');
  let channelId = initialChannel(projection, options.channel);
  const paint = (): void => {
    const channel = projection.channels.find((candidate) => candidate.channelId === channelId)!;
    section.dataset['flowChannel'] = channelId;
    steps.replaceChildren(credentialStep(projection, channel), modelStep(projection, channel, options));
  };
  for (const channel of projection.channels) {
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
