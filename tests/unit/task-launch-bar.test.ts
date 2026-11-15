import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mountTaskDrawer, type TaskLaunchRequest } from '../../src/renderer/task-drawer.js';
import { modelServiceChannels } from '../../src/service/launch-policy.js';
import { MODEL_SERVICE_CONNECTION_IDS } from '../../src/shared/protocol/model-service.js';
import { BASELINE_ANALYSIS_TASK_GOAL, type ModelServiceSettingsProjection } from '../../src/shared/protocol.js';
import { LEDGER_TASK_LAUNCH_KINDS, type LedgerTaskLaunchOperation } from '../../src/shared/runtime-execution-config.js';
import { preferenceDefaults } from '../../src/shared/preferences.js';
import { installMiniDom, miniDocument } from '../support/mini-dom.js';
import { WRITING_REQUEST } from '../support/writing-task.js';

// Leaf panels are unrelated to an ordinary launch. The real drawer, chooser and start handler run here.
vi.mock('../../src/renderer/task-panel.js', () => ({
  mountTaskPanel: () => ({ element: document.createElement('div'), stop: vi.fn() }),
  mountTaskComposer: () => ({ element: document.createElement('div'), stop: vi.fn() }),
}));
vi.mock('../../src/renderer/dialogue.js', () => ({ mountDialogue: () => ({ element: document.createElement('div'), stop: vi.fn() }) }));
let uninstall: () => void;
beforeEach(() => { uninstall = installMiniDom(); vi.stubGlobal('window', { setTimeout, clearTimeout, getSelection: () => null }); });
afterEach(() => { vi.unstubAllGlobals(); uninstall(); });

it.each(Object.keys(LEDGER_TASK_LAUNCH_KINDS) as LedgerTaskLaunchOperation[])('keeps %s remembered choice through unavailable-model fallback without changing other kinds', async operation => {
  const kind = LEDGER_TASK_LAUNCH_KINDS[operation];
  const remembered = { modelConnectionId: 'previous-instance-connection', modelId: 'previous-model', reasoningEffort: 'high' };
  const values = { ...preferenceDefaults(), 'model.dispatchChoices': { [kind]: remembered, 'review-run': { modelId: 'other-task-model' } } };
  const channels = modelServiceChannels(), channel = channels.find(channel=>channel.route==='opencode-go')!;
  const connection = { connectionId: MODEL_SERVICE_CONNECTION_IDS['opencode-go'], credentialOperationState: 'ready' };
  const settings = { channels, roles: [{ roleId: 'main-editorial', connection, binding: { modelId: channel.models[0]!.modelId } }],
    routeChoice: { routes: [{ route: 'opencode-go', connection }] } } as unknown as ModelServiceSettingsProjection;
  const before = JSON.stringify({ values, roles: settings.roles });
  const notice = '上次选择的模型已不可用，本次已使用角色默认模型。';
  const launch = vi.fn(async (_input: unknown) => ({ taskIntentId: 'task', runRecordId: 'run', launchNotice: notice }));
  const previewTaskLaunch = vi.fn(async () => ({ steps: ['逐章读取'], scope: '全书 · 1 个阅读范围', units: 1, reference: ['勾选的资料'], send: '所选资料发往模型服务', usage: '暂无可靠估计', adaptations: [] }));
  const api = { previewTaskLaunch, [operation]: launch, getPreferences: async () => ({ version: 1, values, notice: null }), getModelServiceSettings: async () => settings,
    inspectEvaluation: async () => ({ bookId: 'book', materials: { items: [] }, market: { series: [] } }) };
  const root = document.createElement('aside'); document.body.append(root);
  const setStatus = vi.fn();
  const options = { root, shell: document.body, api, setStatus, errorMessage: (_error: unknown, fallback: string) => fallback,
    onOpen: vi.fn(), onRecorded: vi.fn(), settle: async () => true } as unknown as Parameters<typeof mountTaskDrawer>[0];
  const drawer = mountTaskDrawer(options); drawer.open = vi.fn();
  const input = operation === 'launchBaselineAnalysis' ? { goal: BASELINE_ANALYSIS_TASK_GOAL, update: null }
    : operation === 'launchCustomAnalysis' ? { dimensionId: 'dimension', update: null } : operation === 'launchWritingTask' ? WRITING_REQUEST
      : operation === 'launchReadersReport' ? { template: 'author' } : operation === 'launchEvaluationRewrite' ? { recordId: 'record' } : {};
  drawer.openLaunch({ operation, bookId: 'book', title: kind, input } as TaskLaunchRequest, () => null);
  await vi.waitFor(() => expect(miniDocument.querySelector('[data-task-drawer-control="launch"]')?.disabled).toBe(false));
  expect(miniDocument.querySelector('.dispatch-chooser summary')?.textContent).toContain(channel.models[0]!.modelLabel);
  miniDocument.querySelector('[data-task-drawer-control="preview-launch"]')!.click();
  await vi.waitFor(() => expect(miniDocument.querySelector('.task-launch-estimate')?.textContent).toContain('勾选的资料'));
  miniDocument.querySelector('[data-task-launch-option="budget"]')!.value='12345';
  miniDocument.body.dispatchEvent({type:'input'});
  expect(miniDocument.querySelector('.task-launch-preview-stale')?.textContent).toBe('选项已变化，请更新计划。');
  expect(miniDocument.querySelector('.task-launch-estimate')?.textContent).not.toContain('勾选的资料');
  miniDocument.querySelector('[data-task-drawer-control="launch"]')!.click();
  await vi.waitFor(() => expect(launch).toHaveBeenCalledOnce());
  await vi.waitFor(() => expect(setStatus).toHaveBeenCalledWith(notice, 'success'));
  expect(launch.mock.calls[0]![0]).toMatchObject({ rememberedChoice: true, executionConfig: remembered });
  expect(JSON.stringify({ values, roles: settings.roles })).toBe(before);
});
