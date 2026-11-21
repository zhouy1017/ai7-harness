import { expect, it } from 'vitest';
import type { GlobalAttentionItemProjection, TaskOverviewItemProjection } from '../../src/shared/protocol.js';
import { globalAttentionReason } from '../../src/renderer/global-attention-labels.js';
import { taskBarResumableStatement, taskBarRestartStatement, taskBarView } from '../../src/renderer/task-drawer-labels.js';
import { taskPlanFixture } from '../support/task-plan-fixture.js';
import { taskOverviewCard } from '../../src/renderer/tasks-overview.js';
import { setTechnicalLayerVisible } from '../../src/renderer/technical-layer.js';
import { installMiniDom } from '../support/mini-dom.js';

const PAUSED = 'AI7 关闭时这项任务还没有做完；已完成的部分都已保存，继续时接着处理，也可以取消它。';
const QUEUED = 'AI7 关闭时这项任务还在排队，没有开始，也没有发送任何内容。';
it.each(['yielded', 'pausing-to-yield', 'queued', 'editor-paused', 'no-route', 'running'] as const)('reads the true restart %s labels (#1656)', (found) => {
  const restore = installMiniDom();
  setTechnicalLayerVisible(false);
  try {
    const queued = found === 'queued' || found === 'no-route';
    const manual = found === 'editor-paused' || found === 'no-route';
    const attention: GlobalAttentionItemProjection = {
      itemId: 'restart-run', group: 'exceptions', state: queued ? 'analysis-blocked' : found === 'running' ? 'analysis-resumable' : 'analysis-paused',
      blocked: queued, at: '2026-11-21T00:00:00.000Z', book: { bookId: 'book', title: '合成书名' },
      object: { kind: 'analysis', mode: 'first-baseline' },
      facts: { progress: null, categories: [], revisionOrdinal: null, ...(manual ? {} : { stopReason: 'shutdown' as const }) },
      nextStep: 'view-run', target: { kind: 'analysis', bookId: 'book', taskIntentId: 'task' }, technical: [],
    };
    const reason = found === 'no-route' ? '模型服务当前不可用，任务尚未开始。'
      : queued ? QUEUED : found === 'editor-paused' ? '已暂停：已完成的部分都已保存；继续时接着处理，也可以取消它。'
        : found === 'running' ? 'AI7 关闭时任务尚未完成，继续时接着处理未完成的部分。' : PAUSED;
    expect(globalAttentionReason(attention)).toBe(reason);
    const item: TaskOverviewItemProjection = {
      itemId: attention.itemId, bookId: 'book', bookTitle: '合成书名', taskKind: 'baseline-analysis', label: '分析',
      at: attention.at, detail: null, attention, selection: null, plan: null, result: null,
      state: queued ? 'waiting' : 'paused', progress: null, queuePosition: null, eta: null, usage: null,
      nextAction: 'view-run', runRecordId: 'run', target: attention.target,
    };
    const line = taskOverviewCard(item, () => undefined).querySelector('.task-overview-card-line')?.textContent;
    expect(line).toBe(found === 'editor-paused' ? `你 ${new Date(item.at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} 暂停 · 可继续` : reason);
    const state = { key: queued ? 'blocked' as const : found === 'running' ? 'resumable' as const : 'paused' as const, label: '已暂停', ...(manual ? {} : { stopReason: 'shutdown' as const }) };
    expect(taskBarRestartStatement(state)).toBe(manual || found === 'running' ? null : queued ? QUEUED : PAUSED);
    if (queued) {
      const plan = taskPlanFixture({ kind: 'writing', state });
      const view = taskBarView({ ...plan, start: { ...plan.start, readiness: 'started' } });
      expect(view.statement).toBe(manual ? null : QUEUED);
      expect(view.note).toContain('取消后不再提醒。');
    }
    expect(taskBarResumableStatement('shutdown')).toBe('AI7 关闭时正在运行；已读完的部分都已保存。继续时从下一部分接着读，在此之前不会发送任何内容。');
    expect(globalAttentionReason({ ...attention, state: 'analysis-blocked', facts: { progress: null, categories: [], revisionOrdinal: null } }))
      .toBe('模型服务当前不可用，任务尚未开始。');
  } finally { restore(); }
});

it('keeps the restart-paused drawer statement and paused status beside continue (#1656 B1)', () => {
  const plan = taskPlanFixture({ state: { key: 'paused', label: '已暂停', stopReason: 'shutdown' }, runControl: {
    runRecordId: 'run', stopReason: 'shutdown', cancelling: false, pausing: false,
    cancel: { reason: null, impact: [] }, pause: { reason: null }, resume: { reason: null }, redo: { reason: null },
    activity: null, executingSince: null, update: null, continuation: null, accountLimit: null, outcomeUnknown: null,
  } });
  const view = taskBarView({ ...plan, start: { ...plan.start, readiness: 'started' } });
  expect(view.statement).toBe(PAUSED);
  expect(view.status).toBe('已暂停');
});

it('explains the restart-queued baseline in the drawer without run controls (#1656 B1)', () => {
  const plan = taskPlanFixture({ state: { key: 'blocked', label: '没有开始', stopReason: 'shutdown' } });
  expect(taskBarView({ ...plan, start: { ...plan.start, readiness: 'started' } }).statement).toBe(QUEUED);
});
