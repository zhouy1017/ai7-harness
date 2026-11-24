import type { ModelServiceSettingsProjection, ModelServiceSupportedEfforts } from '../../shared/protocol.js';
import type { ModelFavourites } from '../../shared/preferences.js';
import { resolveRuntimeExecutionConfig, type RuntimeExecutionConfig } from '../../shared/runtime-execution-config.js';
import { modelServiceRuntimeBinding } from '../../shared/protocol/model-service.js';
import { MODEL_DEFAULT_EFFORT, effortChoices, paintEffortChoices } from '../model-effort.js';

/** A local choice over settings already read from the instance; it never tests or saves a model binding. */
export function createDispatchChooser(options: { role: 'main-editorial' | 'fast-interaction'; changed(config: RuntimeExecutionConfig): void }) {
  const element = document.createElement('details'); element.className = 'dispatch-chooser';
  const summary = document.createElement('summary'); summary.textContent = '模型 加载中 ▾';
  const panel = document.createElement('div'); panel.className = 'dispatch-chooser-panel'; panel.tabIndex = -1;
  // The native top layer escapes scrolling start bars and composers without widening their overflow.
  const topLayer = typeof panel.showPopover === 'function';
  if (topLayer) panel.setAttribute('popover', 'manual');
  const modelLabel = document.createElement('label'); modelLabel.textContent = '模型';
  const models = document.createElement('select'); models.setAttribute('aria-label', '本次任务的模型');
  const effortLabel = document.createElement('label'); effortLabel.textContent = '思考强度';
  const efforts = document.createElement('select'); efforts.setAttribute('aria-label', '本次任务的思考强度');
  const effortNote = document.createElement('p'); effortNote.className = 'field-note dispatch-chooser-effort-note';
  const reset = document.createElement('button'); reset.type = 'button'; reset.textContent = '恢复默认';
  modelLabel.append(models); effortLabel.append(efforts); panel.append(modelLabel, effortLabel, effortNote, reset); element.append(summary, panel);
  const placePanel = (): void => {
    if (!topLayer || !element.open) return;
    const anchor = summary.getBoundingClientRect(), bounds = panel.getBoundingClientRect();
    panel.style.left = `${Math.max(8, Math.min(anchor.left, window.innerWidth - bounds.width - 8))}px`;
    panel.style.top = `${Math.max(8, anchor.top >= bounds.height + 8 ? anchor.top - bounds.height : Math.min(anchor.bottom, window.innerHeight - bounds.height - 8))}px`;
  };
  const stopListening = (): void => {
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('scroll', scrolled, true);
    window.removeEventListener('resize', dismiss);
  };
  const dismiss = (): void => { element.open = false; if (topLayer && panel.matches(':popover-open')) panel.hidePopover(); stopListening(); };
  const outside = (event: Event): void => { if (!element.contains(event.target as Node)) dismiss(); };
  const scrolled = (event: Event): void => { if (!panel.contains(event.target as Node)) dismiss(); };
  const refreshPanel = (): void => {
    if (topLayer && element.isConnected && element.open) {
      if (!panel.matches(':popover-open')) panel.showPopover();
      placePanel();
      document.addEventListener('pointerdown', outside, true);
      document.addEventListener('scroll', scrolled, true);
      window.addEventListener('resize', dismiss);
    }
  };
  element.addEventListener('toggle', event => {
    if (!topLayer || event.target !== element) return;
    if (element.open) refreshPanel(); else dismiss();
  });
  let settings: ModelServiceSettingsProjection | null = null;
  let choices: Array<{ config: RuntimeExecutionConfig; label: string; route: string; supported: ModelServiceSupportedEfforts | undefined }> = [];
  let defaultChoice: RuntimeExecutionConfig = {};
  let inherited = true;
  /**
   * Lists the chosen model's own levels. A level the model does not offer now (a role default, or the choice a Task froze) stays
   * shown and stays what the Task would use until the editor chooses again; the chooser never replaces it.
   */
  const paint = (effort?: string): void => {
    const choice = choices[models.selectedIndex];
    if (choice === undefined) { summary.textContent = '模型 待设置 ▾'; effortLabel.hidden = true; effortNote.hidden = true; return; }
    effortLabel.hidden = false;
    paintEffortChoices(efforts, effortNote, effortChoices(choice.supported, effort, choice.route));
    summary.textContent = `模型 ${choice.label}${efforts.value === MODEL_DEFAULT_EFFORT ? '' : `@${efforts.value}`} ▾`;
    placePanel();
  };
  const notify = (): void => {
    const choice = choices[models.selectedIndex];
    if (choice !== undefined) options.changed(inherited ? {} : { ...choice.config, reasoningEffort: efforts.value });
  };
  models.addEventListener('change', () => { inherited = false; paint(); notify(); });
  efforts.addEventListener('change', () => { inherited = false; const effort = efforts.value; paint(effort); notify(); });
  reset.addEventListener('click', () => {
    inherited = true;
    const index = choices.findIndex(choice => choice.config.modelConnectionId === defaultChoice.modelConnectionId && choice.config.modelId === defaultChoice.modelId);
    models.selectedIndex = index; paint(defaultChoice.reasoningEffort); options.changed({});
  });
  element.addEventListener('focusout', event => {
    if (event.relatedTarget !== null && event.relatedTarget !== undefined) {
      if (!element.contains(event.relatedTarget as Node)) dismiss();
      return;
    }
    // A sheet reattaches this same chooser and restores its focus synchronously.
    const settled = (): void => { if (element.isConnected && !element.contains(document.activeElement)) dismiss(); };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => requestAnimationFrame(settled));
    else queueMicrotask(settled);
  });
  element.addEventListener('keydown', event => { if (event.key === 'Escape' && element.open) { event.preventDefault(); event.stopPropagation(); dismiss(); summary.focus(); } });
  return {
    element,
    /** Moving a chooser into a rebuilt sheet dismisses its native popover while retaining the details state. */
    refreshPanel,
    unavailable(): void { summary.textContent = '模型 使用角色默认 ▾'; panel.hidden = true; },
    render(next: ModelServiceSettingsProjection, favourites: ModelFavourites = {}, selection: RuntimeExecutionConfig = {}): void {
      panel.hidden = false;
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
          choices.push({ config: { modelConnectionId: connection.connectionId, modelId: model.modelId }, label: model.modelLabel, route: runtime.route, supported: model.supportedEfforts });
          const option = document.createElement('option'); option.value = String(choices.length - 1); option.textContent = `${starred.includes(model.modelId) ? '★ ' : ''}${model.modelLabel}`; group.append(option);
        }
        if (group.children.length > 0) models.append(group);
      }
      inherited = Object.keys(selection).length === 0;
      const selected = resolveRuntimeExecutionConfig(defaultChoice, selection);
      models.selectedIndex = choices.findIndex(choice => choice.config.modelConnectionId === selected.modelConnectionId && choice.config.modelId === selected.modelId);
      if (models.selectedIndex < 0) {
        models.selectedIndex = choices.findIndex(choice => choice.config.modelConnectionId === defaultChoice.modelConnectionId && choice.config.modelId === defaultChoice.modelId);
        paint(defaultChoice.reasoningEffort);
      } else paint(selected.reasoningEffort);
      // A review choice redraws its sheet and reattaches this chooser. Re-enter the native top layer after that move.
      if (topLayer) queueMicrotask(refreshPanel);
    },
  };
}
