import type { ModelServiceSettingsProjection } from '../../shared/protocol.js';
import type { ModelFavourites } from '../../shared/preferences.js';
import type { RuntimeExecutionConfig } from '../../shared/runtime-execution-config.js';
import { CONFIGURED_MODEL_REASONING, CONFIGURED_ROUTE_REASONING } from '../../shared/provider-configuration.generated.js';
import { modelServiceRuntimeBinding } from '../../shared/protocol/model-service.js';

/** A local choice over settings already read from the instance; it never tests or saves a model binding. */
export function createDispatchChooser(options: { role: 'main-editorial' | 'fast-interaction'; changed(config: RuntimeExecutionConfig): void }) {
  const element = document.createElement('details'); element.className = 'dispatch-chooser';
  const summary = document.createElement('summary'); summary.textContent = '模型 加载中 ▾';
  const panel = document.createElement('div'); panel.className = 'dispatch-chooser-panel';
  const modelLabel = document.createElement('label'); modelLabel.textContent = '模型';
  const models = document.createElement('select'); models.setAttribute('aria-label', '本次任务的模型');
  const effortLabel = document.createElement('label'); effortLabel.textContent = '思考强度';
  const efforts = document.createElement('select'); efforts.setAttribute('aria-label', '本次任务的思考强度');
  const reset = document.createElement('button'); reset.type = 'button'; reset.textContent = '恢复默认';
  modelLabel.append(models); effortLabel.append(efforts); panel.append(modelLabel, effortLabel, reset); element.append(summary, panel);
  let settings: ModelServiceSettingsProjection | null = null;
  let choices: Array<{ config: RuntimeExecutionConfig; label: string; levels: readonly string[] }> = [];
  let defaultChoice: RuntimeExecutionConfig = {};
  let inherited = true;
  const paint = (effort?: string): void => {
    const choice = choices[models.selectedIndex];
    if (choice === undefined) { summary.textContent = '模型 待设置 ▾'; effortLabel.hidden = true; return; }
    efforts.replaceChildren();
    const serviceDefault = document.createElement('option'); serviceDefault.value = 'off'; serviceDefault.textContent = '服务默认'; efforts.append(serviceDefault);
    for (const level of choice.levels) {
      const option = document.createElement('option'); option.value = level; option.textContent = level; efforts.append(option);
    }
    if (effort !== undefined && effort !== 'off' && !choice.levels.includes(effort)) {
      const option = document.createElement('option'); option.value = effort; option.textContent = effort; efforts.append(option);
    }
    efforts.value = effort ?? 'off'; effortLabel.hidden = choice.levels.length === 0;
    const sent = effortLabel.hidden || efforts.value === 'off' ? '' : `@${efforts.value}`;
    summary.textContent = `模型 ${choice.label}${sent} ▾`;
  };
  const notify = (): void => {
    const choice = choices[models.selectedIndex];
    if (choice !== undefined) options.changed(inherited ? {} : { ...choice.config, reasoningEffort: effortLabel.hidden ? 'off' : efforts.value });
  };
  models.addEventListener('change', () => { inherited = false; paint(); notify(); });
  efforts.addEventListener('change', () => { inherited = false; const effort = efforts.value; paint(effort); notify(); });
  reset.addEventListener('click', () => {
    inherited = true;
    const index = choices.findIndex(choice => choice.config.modelConnectionId === defaultChoice.modelConnectionId && choice.config.modelId === defaultChoice.modelId);
    models.selectedIndex = index; paint(defaultChoice.reasoningEffort); options.changed({});
  });
  element.addEventListener('keydown', event => { if (event.key === 'Escape') { element.open = false; summary.focus(); } });
  return {
    element,
    unavailable(): void { summary.textContent = '模型 使用角色默认 ▾'; panel.hidden = true; },
    render(next: ModelServiceSettingsProjection, favourites: ModelFavourites = {}): void {
      settings = next; choices = []; models.replaceChildren();
      const role = settings.roles.find(role => role.roleId === options.role);
      defaultChoice = { ...(role?.connection === null || role?.connection === undefined ? {} : { modelConnectionId: role.connection.connectionId }),
        ...(role?.binding === null || role?.binding === undefined ? {} : { modelId: role.binding.modelId, reasoningEffort: role.binding.reasoningEffort ?? 'off' }) };
      for (const channel of settings.channels) {
        const connection = settings.routeChoice.routes.find(route => route.route === channel.route)?.connection;
        if (connection?.credentialOperationState !== 'ready' || channel.route === null) continue;
        const group = document.createElement('optgroup'); group.label = channel.channelLabel;
        const starred = favourites[channel.channelId] ?? [];
        const offered = [...channel.models].sort((a, b) => Number(starred.includes(b.modelId)) - Number(starred.includes(a.modelId)));
        for (const model of offered) {
          const runtime = modelServiceRuntimeBinding(channel.route, model.modelId, options.role === 'main-editorial' ? 'main' : 'fast');
          if (runtime === undefined) continue;
          const levels = CONFIGURED_MODEL_REASONING[`${runtime.route}/${runtime.model}`]?.efforts ?? CONFIGURED_ROUTE_REASONING[runtime.route]?.efforts ?? [];
          choices.push({ config: { modelConnectionId: connection.connectionId, modelId: model.modelId }, label: model.modelLabel, levels });
          const option = document.createElement('option'); option.value = String(choices.length - 1); option.textContent = `${starred.includes(model.modelId) ? '★ ' : ''}${model.modelLabel}`; group.append(option);
        }
        if (group.children.length > 0) models.append(group);
      }
      models.selectedIndex = choices.findIndex(choice => choice.config.modelConnectionId === defaultChoice.modelConnectionId && choice.config.modelId === defaultChoice.modelId);
      paint(defaultChoice.reasoningEffort);
    },
  };
}
