import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mountLaunchBar, type LaunchBar, type TaskLaunchRequest } from '../../src/renderer/components/launch-bar.js';
import { mountWritingTask, type MountWritingTaskOptions } from '../../src/renderer/writing-task.js';
import { setTechnicalLayerVisible } from '../../src/renderer/technical-layer.js';
import { preferenceDefaults } from '../../src/shared/preferences.js';
import { installMiniDom, miniDocument } from '../support/mini-dom.js';

// The writing sheet's one bar (#1526): its start opens the written draft by itself (Issue #1403), as 0.7.2's 开始写作 did; a start
// after 先看计划 was opened leaves 打开草稿 to the editor, as 0.7.2's 查看计划 path did. Public synthetic words only.
let uninstall: () => void;
const bars: LaunchBar[] = [];
beforeEach(() => { uninstall = installMiniDom(); setTechnicalLayerVisible(false); vi.stubGlobal('window', { setTimeout, clearTimeout }); });
afterEach(() => { for (const bar of bars.splice(0)) bar.dispose(); vi.unstubAllGlobals(); setTechnicalLayerVisible(true); uninstall(); });

const type = (drafted: null | { revisionId: string; createdAt: string }) => ({ typeId: 'promotion-article', label: '宣传文章', prepare: { allowed: true, mode: 'writing-first' },
  exemplars: { count: 0, statement: '本社暂无范例。' }, drafted, quickStart: { available: false, reason: '没有默认规则。', rule: null } });
const page = (drafted: null | { revisionId: string; createdAt: string }) => ({ bookId: 'book', unavailable: null,
  references: { synopsis: '本书尚无基线分析。', evaluation: '本书尚无定稿的评估。', book: '图书信息：公开合成书', materials: { statement: '', items: [], more: 0 } },
  consequences: { read: '读取', send: '发送', notDo: '不做', cost: '费用' }, types: [type(drafted)],
  task: drafted === null ? null : { taskIntentId: 'task', typeId: 'promotion-article', typeLabel: '宣传文章', state: 'settled', label: '已完成', refusal: null, planEnvelopeDigest: null } });

async function startWriting(previewFirst: boolean) {
  let current = page(null);
  const launchWritingTask = vi.fn(async () => ({ taskIntentId: 'task', runRecordId: 'run' }));
  const createWritingDraft = vi.fn(async () => ({ writing: page(null), document: { documentId: 'document' } }));
  const openLaunch = (request: TaskLaunchRequest): void => {
    const bar = mountLaunchBar({ api: { launchWritingTask, previewTaskLaunch: async () => ({ steps: [], scope: '', units: 0, reference: [], send: '', usage: '', adaptations: [] }),
      getPreferences: async () => ({ values: preferenceDefaults() }), getModelServiceSettings: async () => ({ channels: [], roles: [], routeChoice: { routes: [] } }) } as never,
    request, errorMessage: (_error, fallback) => fallback, setStatus: vi.fn(), settle: async () => true, onRecorded: vi.fn(), openRun: vi.fn(), interrupted: false });
    bars.push(bar); request.mount!.replaceChildren(...bar.bar);
  };
  const root = miniDocument.createElement('section'); miniDocument.body.append(root);
  const inspectWritingTask = vi.fn(async () => current);
  const surface = mountWritingTask({ root: root as unknown as HTMLElement, api: { inspectWritingTask, createWritingDraft } as never,
    setStatus: vi.fn(), errorMessage: (_error: unknown, fallback: string) => fallback, openLaunch, openDocument: vi.fn(async () => undefined), documentsChanged: vi.fn(),
    openPlan: vi.fn(), awaitServiceJob: vi.fn() } as unknown as MountWritingTaskOptions);
  surface.refresh();
  await vi.waitFor(() => expect(root.querySelector('.writing-task')).not.toBeNull());
  surface.open('promotion-article', '春季宣传');
  const start = () => root.querySelector('[data-writing-action="start"]')!;
  await vi.waitFor(() => expect(start()?.disabled).toBe(false));
  if (previewFirst) {
    const estimate = root.querySelector('.task-launch-estimate')!;
    estimate.open = true; estimate.dispatchEvent({ type: 'toggle' });
  }
  start().click();
  await vi.waitFor(() => expect(launchWritingTask).toHaveBeenCalledOnce());
  current = page({ revisionId: 'drafted-1', createdAt: 'x' });
  const reads = inspectWritingTask.mock.calls.length;
  surface.refresh();
  await vi.waitFor(() => expect(inspectWritingTask.mock.calls.length).toBeGreaterThan(reads));
  if (!previewFirst) await vi.waitFor(() => expect(createWritingDraft).toHaveBeenCalledOnce());
  for (let tick = 0; tick < 5; tick += 1) await new Promise(resolve => setTimeout(resolve, 0));
  surface.destroy();
  return createWritingDraft;
}

it('opens the written draft by itself after the sheet\'s own start', async () => {
  const createWritingDraft = await startWriting(false);
  expect(createWritingDraft).toHaveBeenCalledWith({ revisionId: 'drafted-1', title: '春季宣传' });
});

it('leaves 打开草稿 to the editor after a start that followed 先看计划', async () => {
  const createWritingDraft = await startWriting(true);
  expect(createWritingDraft).not.toHaveBeenCalled();
});
