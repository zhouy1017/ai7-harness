import { majorityGapReason } from '../../src/shared/analysis-run-summary.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  GLOBAL_ATTENTION_EMPTY_LINES,
  GLOBAL_ATTENTION_ENTRY_LABEL,
  GLOBAL_ATTENTION_FINDINGS_NOTE,
  GLOBAL_ATTENTION_GROUP_LABELS,
  GLOBAL_ATTENTION_HEADING,
  GLOBAL_ATTENTION_LEDE,
  GLOBAL_ATTENTION_MATERIAL_GROUPS,
  GLOBAL_ATTENTION_NEXT_STEP_LABELS,
  GLOBAL_ATTENTION_NO_BOOK,
  GLOBAL_ATTENTION_STATE_LABELS,
  GLOBAL_ATTENTION_STATE_PILLS,
  GLOBAL_ATTENTION_STATUS_LINES,
  globalAttentionBookLabel,
  globalAttentionItemBookLabel,
  globalAttentionEntryView,
  globalAttentionGroupCountLine,
  globalAttentionNextStepLine,
  globalAttentionObjectLabel,
  globalAttentionReason,
  globalAttentionStateLabel,
  globalAttentionTimeLine,
  globalAttentionTruncatedLine,
  globalAttentionView,
} from '../../src/renderer/global-attention-labels.js';
import { localInstantLabel } from '../../src/renderer/plan-preview-labels.js';
import { REVIEW_ACTION_LABELS } from '../../src/renderer/review-labels.js';
import {
  TASK_BAR_ADJUST_BUDGET_REDO, TASK_BAR_RECONFIRM, TASK_BAR_REDO, TASK_BAR_REPREPARE, TASK_BAR_RESOLVE_MODEL_SERVICE, TASK_BAR_RUN_LINKS, TASK_BAR_VIEW_UNCONFIRMED,
} from '../../src/renderer/task-drawer-labels.js';
import { RESOLVE_CONFLICT_LABEL } from '../../src/renderer/editorial-mark-labels.js';
import { PROPOSAL_CONFLICT_CLASSIFICATION } from '../../src/renderer/proposal-conflict-labels.js';
import {
  GLOBAL_ATTENTION_GROUP_KEYS,
  GLOBAL_ATTENTION_NEXT_STEPS,
  type GlobalAttentionGroupKey,
  type GlobalAttentionItemProjection,
  type GlobalAttentionProjection,
  type GlobalAttentionStateKey,
} from '../../src/shared/protocol.js';
import { TASK_PLAN_STATE_PILLS } from '../../src/renderer/task-drawer-labels.js';
import { mountGlobalAttention, mountGlobalAttentionEntry, type GlobalAttentionReading, type GlobalAttentionReader } from '../../src/renderer/global-attention.js';
import { setTechnicalLayerVisible } from '../../src/renderer/technical-layer.js';
import { installMiniDom, miniDocument, type MiniElement } from '../support/mini-dom.js';

// Unit suite for 待我处理's words (Issue #424, plan slice S78; editor-surfaces §8.1, V2-UX-ATTN-001 to 009):
// every group heading, state, reason and safe next step byte for byte; the next steps pinned to the words the
// product already uses at each record; and the ATTN-009 material table. The renderer's view model is pure,
// so the whole screen is read here without a DOM.

const RENDERER = readFileSync(fileURLToPath(new URL('../../src/renderer/index.ts', import.meta.url)), 'utf8');
// The Manuscript screen owns its toolbar, so the recovery return's button is read there (Issue #1127).
const MANUSCRIPT_SCREEN = readFileSync(fileURLToPath(new URL('../../src/renderer/manuscript-screen.ts', import.meta.url)), 'utf8');
// ②A's baseline-analysis card owns its Task outcome's next step (Issue #1172).
const AT = '2026-09-23T04:05:06.000Z';

const STATES: ReadonlyArray<GlobalAttentionStateKey> = [
  'apply-outcome-unresolved',
  'import-outcome-uncertain', 'import-cleanup-pending', 'recovery-pending', 'recovery-deferred',
  'manuscript-conflict', 'manuscript-conflict-deferred', 'analysis-failed',
  'analysis-interrupted', 'analysis-budget-reached', 'analysis-account-limit', 'analysis-outcome-unknown', 'analysis-outcome-unconfirmed', 'analysis-blocked', 'analysis-orphaned', 'review-failed', 'review-stopped',
  'analysis-plan-revision', 'analysis-plan-moved', 'analysis-clarification', 'analysis-queued', 'analysis-running', 'analysis-waiting-network', 'analysis-waiting-connection',
  'analysis-waiting-slot', 'analysis-waiting-admission', 'analysis-waiting-capacity', 'analysis-waiting-idle', 'analysis-yielded', 'analysis-cancelling', 'analysis-pausing', 'analysis-paused', 'analysis-resumable',
  'review-running', 'review-continuable',
  'analysis-completed', 'analysis-completed-with-gaps', 'review-completed',
  'analysis-prepared', 'review-prepared', 'analysis-cancelled',
  'maintenance-pending', 'maintenance-waiting',
  'library-attribution-pending', 'learning-eligibility-pending', 'learning-eligibility-deferred',
  'learning-materials-pending', 'learning-materials-deferred',
  'dialogue-answering', 'dialogue-answered', 'dialogue-stopped', 'dialogue-interrupted', 'dialogue-failed',
  'indexing-completed',
  'draft-unfinished',
];

function item(state: GlobalAttentionStateKey, overrides: Partial<GlobalAttentionItemProjection> = {}): GlobalAttentionItemProjection {
  return {
    itemId: `analysis:${state}`,
    group: 'exceptions',
    state,
    blocked: false,
    at: AT,
    book: { bookId: '00000000-0000-4000-8000-000000000000', title: '待我处理旅程甲' },
    object: { kind: 'analysis', mode: 'first-baseline' },
    facts: { progress: null, categories: [], revisionOrdinal: null },
    nextStep: 'view-run',
    target: { kind: 'analysis', bookId: '00000000-0000-4000-8000-000000000000', taskIntentId: '00000000-0000-4000-8000-000000000001' },
    technical: [],
    ...overrides,
  };
}

function projection(groups: Partial<Record<GlobalAttentionGroupKey, ReadonlyArray<GlobalAttentionItemProjection>>>, totals: Partial<Record<GlobalAttentionGroupKey, number>> = {}): GlobalAttentionProjection {
  const built = GLOBAL_ATTENTION_GROUP_KEYS.map((key) => ({ key, items: groups[key] ?? [], total: totals[key] ?? (groups[key] ?? []).length }));
  return { groups: built, actionableCount: built[0]!.total + built[1]!.total, running: false, processing: { state: 'local' } };
}

describe('the entry and the screen', () => {
  it('filters shelved learning targets from both the ordinary attention badge and its items, restoring them in developer mode', () => {
    const restore = installMiniDom();
    setTechnicalLayerVisible(false);
    try {
      const learning = item('learning-materials-pending', { itemId: 'learning', group: 'decisions',
        object: { kind: 'learning-materials', pending: 1, deferred: 0 }, nextStep: 'decide-learning-materials', target: { kind: 'learning-materials', bookId: 'book' } });
      const data = projection({ decisions: [learning, item('analysis-prepared', { itemId: 'plan', group: 'decisions' })],
        exceptions: [item('analysis-failed')], recent: [item('analysis-completed', { group: 'recent' })] });
      const listeners = new Set<(reading: GlobalAttentionReading) => void>();
      const reader: GlobalAttentionReader = { refresh: () => { for (const listener of listeners) listener({ kind: 'projection', projection: data }); },
        subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; }, interrupt: () => undefined };
      const entry = document.createElement('button');
      const root = document.createElement('main');
      miniDocument.body.append(root as unknown as MiniElement);
      mountGlobalAttentionEntry({ button: entry, reader, open: () => undefined });
      const surface = mountGlobalAttention({ root, reader, technicalDetails: () => document.createElement('details'),
        setStatus: () => undefined, errorMessage: (_error, fallback) => fallback, open: async () => undefined, openNetworkProxySettings: () => undefined });
      surface.start();
      expect(entry.dataset['attentionCount']).toBe('2');
      expect(entry.getAttribute('aria-label')).toContain('2 项需要你处理');
      expect(root.querySelector('[data-attention-item="learning"]')).toBeNull();
      expect(root.querySelector('[data-attention-item="plan"]')).not.toBeNull();
      const card = root.querySelector<HTMLElement>('[data-attention-item="plan"]')!;
      expect(card.querySelector('.global-attention-object .global-attention-pill')).not.toBeNull();
      expect(card.querySelector('.global-attention-body')!.children).toHaveLength(2);
      expect(card.querySelector('details')).toBeNull();
      expect(card.textContent).not.toContain('安全的下一步：');

      expect(root.querySelector<HTMLElement>('[data-attention-count]')!.dataset['attentionCount']).toBe('2');
      setTechnicalLayerVisible(true); reader.refresh();
      expect(entry.dataset['attentionCount']).toBe('3');
      expect(root.querySelector('[data-attention-item="learning"]')).not.toBeNull();
      expect(root.querySelector<HTMLElement>('[data-attention-count]')!.dataset['attentionCount']).toBe('3');
      expect(data.actionableCount).toBe(3);
      surface.destroy();
    } finally { setTechnicalLayerVisible(true); restore(); }
  });

  it('names 待我处理 and shows the count only while the first two groups hold anything', () => {
    expect(GLOBAL_ATTENTION_ENTRY_LABEL).toBe('待我处理');
    expect(globalAttentionEntryView(null)).toEqual({ text: '待我处理', badge: null, accessibleName: '待我处理' });
    expect(globalAttentionEntryView(0)).toEqual({ text: '待我处理', badge: null, accessibleName: '待我处理' });
    expect(globalAttentionEntryView(2)).toEqual({ text: '待我处理', badge: '2', accessibleName: '待我处理，2 项需要你处理' });
    expect(GLOBAL_ATTENTION_HEADING).toBe('待我处理');
    expect(GLOBAL_ATTENTION_LEDE).toBe('所有图书里需要你处理的事项。点开一项回到它自己的记录，在那里决定；这里只列出，不替你做任何决定。');
    expect(GLOBAL_ATTENTION_FINDINGS_NOTE).toBe('书内的发现在那本书的「发现」里。');
  });

  it('keeps the four groups in their one fixed order, each with a quiet line when empty', () => {
    expect(GLOBAL_ATTENTION_GROUP_KEYS.map((key) => GLOBAL_ATTENTION_GROUP_LABELS[key]).join(' · '))
      .toBe('异常与结果待确认 · 等待你的决定 · 运行中与已暂停 · 最近完成');
    expect(GLOBAL_ATTENTION_EMPTY_LINES).toEqual({
      exceptions: '没有异常或待确认的结果。',
      decisions: '没有等待你的决定。',
      active: '没有正在运行或中途停止的任务。',
      recent: '最近 7 天没有完成的任务。',
    });
    const empty = globalAttentionView(projection({}));
    expect(empty.map((group) => [group.key, group.heading, group.empty, group.items.length, group.countLine]))
      .toEqual(GLOBAL_ATTENTION_GROUP_KEYS.map((key) => [key, GLOBAL_ATTENTION_GROUP_LABELS[key], GLOBAL_ATTENTION_EMPTY_LINES[key], 0, '']));
  });

  it('says only the first two groups need the editor, and names a group longer than its answer', () => {
    expect(globalAttentionGroupCountLine('exceptions', 3)).toBe('3 项需要你处理');
    expect(globalAttentionGroupCountLine('decisions', 1)).toBe('1 项需要你处理');
    expect(globalAttentionGroupCountLine('active', 2)).toBe('2 项');
    expect(globalAttentionGroupCountLine('recent', 5)).toBe('5 项');
    expect(globalAttentionGroupCountLine('exceptions', 0)).toBe('');
    expect(globalAttentionTruncatedLine('exceptions', 50, 50)).toBeNull();
    expect(globalAttentionTruncatedLine('exceptions', 50, 57)).toBe('共 57 项，这里列出最早的 50 项。');
    expect(globalAttentionTruncatedLine('recent', 20, 24)).toBe('共 24 项，这里列出最新的 20 项。');
    const view = globalAttentionView(projection({ exceptions: [item('analysis-failed')], recent: [item('analysis-completed', { group: 'recent' })] }, { exceptions: 57 }));
    expect(view.map((group) => group.counted)).toEqual([true, true, false, false]);
    expect(view[0]!.truncated).toBe('共 57 项，这里列出最早的 1 项。');
    expect(view[0]!.countLine).toBe('57 项需要你处理');
  });

  it('keeps its status lines', () => {
    expect(GLOBAL_ATTENTION_STATUS_LINES).toEqual({
      loading: '正在读取待我处理…',
      opened: '待我处理已打开',
      refreshFailed: '无法刷新待我处理。',
      unavailable: '无法读取待我处理。',
      opening: '正在打开这一项的记录…',
      openFailed: '无法打开这一项的记录。',
      leaving: '正在保存并打开待我处理…',
      stayed: '当前页面还有保存或写入没有完成；完成后再打开待我处理。',
    });
  });
});

describe('each item', () => {
  it('names every state in its record\'s own words, with a shape as well as a tone', () => {
    expect(Object.keys(GLOBAL_ATTENTION_STATE_LABELS).sort()).toEqual([...STATES].sort());
    expect(GLOBAL_ATTENTION_STATE_LABELS).toEqual({
      'apply-outcome-unresolved': '应用结果待确认',
      'import-outcome-uncertain': '导入提交结果待确认',
      'import-cleanup-pending': '放弃清理尚未完成',
      'recovery-pending': '恢复待确认状态',
      'recovery-deferred': '恢复待确认状态 · 已稍后处理',
      'manuscript-conflict': '需要解决冲突',
      'manuscript-conflict-deferred': '需要解决冲突 · 暂不处理',
      'analysis-failed': '运行失败',
      'analysis-interrupted': '已中断',
      'analysis-budget-reached': '已停止 · 预算已达上限',
      'analysis-account-limit': '模型服务账户限额',
      'analysis-outcome-unknown': '该单元结果未知',
      'analysis-outcome-unconfirmed': '结果待确认',
      'analysis-blocked': '派发前已阻止',
      'analysis-orphaned': '已中断',
      'review-failed': '运行失败',
      'review-stopped': '中途停止',
      'analysis-plan-revision': '计划修订',
      'analysis-plan-moved': '需要重新确认计划',
      'analysis-clarification': '等你回答',
      'analysis-queued': '正在排队',
      'analysis-running': '运行中',
      'analysis-waiting-network': '等待网络',
      'analysis-waiting-connection': '需要处理模型连接',
      // Issue #632: a Connectivity-Wait Run holds no place in the capacity queue, so it never reads 等待运行名额.
      'analysis-waiting-slot': '已联网 · 名额已满',
      'analysis-waiting-admission': '正在排队',
      'analysis-waiting-capacity': '等待运行名额',
      'analysis-waiting-idle': '等待空闲',
      'analysis-yielded': '让位给你的任务',
      'analysis-cancelling': '正在取消',
      'analysis-pausing': '正在暂停',
      'analysis-paused': '已暂停',
      'analysis-resumable': '任务已中断 · 可续行',
      'review-running': '运行中',
      'review-continuable': '中途停止 · 可继续审阅',
      'analysis-completed': '已完成',
      'analysis-completed-with-gaps': '已完成 · 保留缺口',
      'review-completed': '已完成',
      // The 任务 panel's own three (Issue #423, S77a).
      'analysis-prepared': '计划已准备 · 等你开始',
      'review-prepared': '计划已准备 · 等你开始',
      'analysis-cancelled': '已取消',
      'maintenance-pending': '维护事项待处理',
      'maintenance-waiting': '维护事项待处理 · 等待另设发稿版本',
      // A 资料库 item waiting for the editor (Issue #427, S79c; ATTN-009): the words the material table placed it under.
      'library-attribution-pending': '资料库归属待定',
      'learning-eligibility-pending': '学习准入待定',
      'learning-eligibility-deferred': '学习准入待定 · 稍后决定',
      // A Book's Learning Material (Issue #61, S26b).
      'learning-materials-pending': '学习准入待处理',
      'learning-materials-deferred': '学习准入待处理 · 稍后决定',
      // 索引完成 (Issue #428, S80a; ATTN-009): the material table's own words.
      'indexing-completed': '索引完成',
      // A dialogue Task (Issue #52, S17a): away from the foreground only 等待回答 (DIALOG-010); DIALOG-012's words once incomplete.
      'dialogue-answering': '等待回答',
      'dialogue-answered': '已回答',
      'dialogue-stopped': '回答已停止 · 内容不完整',
      'dialogue-interrupted': '回答中断 · 内容不完整',
      'dialogue-failed': '回答未能完成 · 内容不完整',
      // An unfinished Task Intent Draft (Issue #423, slice 7a): no Task until 准备计划.
      'draft-unfinished': '任务草稿 · 尚未准备计划',
    });
    for (const state of STATES) {
      expect(GLOBAL_ATTENTION_STATE_PILLS[state].shape).toMatch(/^(circle|ring|half|triangle|square|diamond|check|dash)$/u);
    }
    // A Run under way or stopped reads with the same pill here as in the Task Drawer (S76b reading 6).
    for (const [state, drawer] of [['analysis-cancelling', 'cancelling'], ['analysis-pausing', 'pausing'], ['analysis-paused', 'paused'], ['analysis-resumable', 'resumable']] as const) {
      expect(GLOBAL_ATTENTION_STATE_PILLS[state]).toEqual(TASK_PLAN_STATE_PILLS[drawer]);
    }
    // 已暂停 names a Run the editor paused and nothing else — a Review Run a stopped service left mid-way is never called
    // so (Issue #422, S76b) — and no generic decision word stands in for a named one.
    for (const [state, word] of Object.entries(GLOBAL_ATTENTION_STATE_LABELS)) {
      if (state !== 'analysis-paused') expect(word).not.toMatch(/已暂停/u);
    }
    const words = [...Object.values(GLOBAL_ATTENTION_STATE_LABELS), ...Object.values(GLOBAL_ATTENTION_GROUP_LABELS).slice(0, 2)];
    for (const word of words) expect(word).not.toMatch(/待审批|批准/u);
  });

  it('states a safe next step from a closed map of words each record already uses', () => {
    expect(Object.keys(GLOBAL_ATTENTION_NEXT_STEP_LABELS).sort()).toEqual([...GLOBAL_ATTENTION_NEXT_STEPS].sort());
    expect(GLOBAL_ATTENTION_NEXT_STEP_LABELS).toEqual({
      'view-apply-receipt': '查看应用凭据',
      'view-run': '查看运行',
      'view-review': '查看审阅',
      'reconfirm-plan': '重新确认计划',
      'continue-review': '继续审阅',
      'return-to-recovery': '返回恢复待确认',
      'retry-abandon-cleanup': '重试放弃清理',
      'await-local-check': '等待本地核对',
      'resolve-conflict': '解决冲突…',
      'answer-clarification': '回答问题',
      'adjust-budget-redo': '调整预算并重做',
      'resolve-model-service': '处理模型服务',
      'open-network-proxy': '去设置 › 模型服务 › 网络代理',
      // 结果待确认's first step (Issue #51, S16c): which ranges are unconfirmed, never a repeat-shaped action.
      'view-unconfirmed': '查看未确认的部分',
      reprepare: '重新准备',
      redo: '改计划重做',
      // A prepared plan nobody started (Issue #423, S77a): the drawer's own entry to it.
      'view-plan': '查看计划并开始',
      'maintenance-link-proposal': '关联修改建议',
      'maintenance-link-publication': '关联发稿版本',
      'maintenance-write-errata': '编写勘误',
      'maintenance-conclude': '记录维护事项结论',
      // A 资料库 item's own two decisions (Issue #427, S79c): its card's buttons.
      'set-library-attribution': '定归属…',
      'set-learning-eligibility': '定学习准入…',
      'decide-learning-materials': '定学习准入…',
      // A dialogue Task's own way to its dialogue (Issue #52, S17a; TASK-044).
      'open-dialogue': '打开对话',
      // A 资料库 item's index (Issue #428, S80a): its card, with the layers and 查看分段.
      'view-material-index': '查看索引',
      // A Task Intent Draft beside its own Book's manuscript (Issue #423, slice 7a).
      'continue-draft': '继续编辑草稿',
    });
    // The drawer's own words for the way on from a Run the ceiling stopped (Issue #51, S16a).
    expect(GLOBAL_ATTENTION_NEXT_STEP_LABELS['adjust-budget-redo']).toBe(TASK_BAR_ADJUST_BUDGET_REDO);
    expect(GLOBAL_ATTENTION_STATE_PILLS['analysis-budget-reached'].shape).not.toBe(GLOBAL_ATTENTION_STATE_PILLS['analysis-running'].shape);
    // A Provider Account Limit's remediation route (Issue #51, S16b), the drawer's own words for it.
    expect(GLOBAL_ATTENTION_NEXT_STEP_LABELS['resolve-model-service']).toBe(TASK_BAR_RESOLVE_MODEL_SERVICE);
    expect(GLOBAL_ATTENTION_STATE_PILLS['analysis-account-limit'].shape).not.toBe(GLOBAL_ATTENTION_STATE_PILLS['analysis-resumable'].shape);
    // 结果待确认 (Issue #51, S16c): the drawer's own words for its first step, and the pill 导入提交结果待确认 has — never a
    // failure's, nor 可续行's.
    expect(GLOBAL_ATTENTION_NEXT_STEP_LABELS['view-unconfirmed']).toBe(TASK_BAR_VIEW_UNCONFIRMED);
    expect(GLOBAL_ATTENTION_STATE_PILLS['analysis-outcome-unknown']).toEqual(GLOBAL_ATTENTION_STATE_PILLS['import-outcome-uncertain']);
    expect(GLOBAL_ATTENTION_STATE_PILLS['analysis-outcome-unknown'].shape).not.toBe(GLOBAL_ATTENTION_STATE_PILLS['analysis-resumable'].shape);
    // …and what a completed Run left 结果待确认 (Issue #757) reads as the same outcome to confirm.
    expect(GLOBAL_ATTENTION_STATE_PILLS['analysis-outcome-unconfirmed']).toEqual(GLOBAL_ATTENTION_STATE_PILLS['analysis-outcome-unknown']);
    // A waiting Run whose plan moved (Issue #536; OFF-008): the drawer's own words and pill, never 派发前已阻止's.
    expect(GLOBAL_ATTENTION_NEXT_STEP_LABELS.reprepare).toBe(TASK_BAR_REPREPARE);
    // A Run the launch's ceiling stopped under developer-live (Issue #541): the drawer's 改计划重做, and words that say the
    // ceiling was the launch's and a relaunch raises it.
    expect(GLOBAL_ATTENTION_NEXT_STEP_LABELS.redo).toBe(TASK_BAR_REDO);
    expect(globalAttentionReason(item('analysis-budget-reached', { nextStep: 'redo' })))
      .toBe('已到本次启动的预算上限，保留结果后停下；提高启动预算后可重做。');
    expect(GLOBAL_ATTENTION_STATE_PILLS['analysis-plan-moved']).toEqual(TASK_PLAN_STATE_PILLS['plan-moved']);
    expect(GLOBAL_ATTENTION_STATE_PILLS['analysis-plan-moved']).not.toEqual(GLOBAL_ATTENTION_STATE_PILLS['analysis-blocked']);
    // Pinned to the words the record's own surface uses there.
    expect(GLOBAL_ATTENTION_NEXT_STEP_LABELS['resolve-conflict']).toBe(RESOLVE_CONFLICT_LABEL);
    expect(GLOBAL_ATTENTION_STATE_LABELS['manuscript-conflict']).toBe(PROPOSAL_CONFLICT_CLASSIFICATION);
    expect(GLOBAL_ATTENTION_NEXT_STEP_LABELS['view-run']).toBe(TASK_BAR_RUN_LINKS['baseline-analysis']);
    expect(GLOBAL_ATTENTION_NEXT_STEP_LABELS['view-review']).toBe(TASK_BAR_RUN_LINKS['review-run']);
    expect(GLOBAL_ATTENTION_NEXT_STEP_LABELS['reconfirm-plan']).toBe(TASK_BAR_RECONFIRM);
    expect(GLOBAL_ATTENTION_NEXT_STEP_LABELS['continue-review']).toBe(REVIEW_ACTION_LABELS.continue);
    expect(MANUSCRIPT_SCREEN).toContain(`button('${GLOBAL_ATTENTION_NEXT_STEP_LABELS['return-to-recovery']}'`);
    expect(RENDERER).toContain(`button('${GLOBAL_ATTENTION_NEXT_STEP_LABELS['retry-abandon-cleanup']}'`);
    expect(RENDERER).toContain(`${GLOBAL_ATTENTION_NEXT_STEP_LABELS['await-local-check']}；不要重复导入`);
    expect(globalAttentionNextStepLine('reconfirm-plan')).toBe('重新确认计划');
    // No step grants anything, and none says 授权.
    for (const label of Object.values(GLOBAL_ATTENTION_NEXT_STEP_LABELS)) expect(label).not.toMatch(/授权|批准|待审批/u);
  });

  it('names the Book and the object in the record\'s own terms', () => {
    expect(globalAttentionBookLabel({ bookId: null, title: '新书' })).toBe('《新书》');
    expect(globalAttentionBookLabel({ bookId: null, title: null })).toBe(GLOBAL_ATTENTION_NO_BOOK);
    expect(GLOBAL_ATTENTION_NO_BOOK).toBe('尚未选择目标图书');
    expect(globalAttentionObjectLabel({ kind: 'analysis', mode: 'first-baseline' })).toBe('基线分析 · 首次基线分析');
    expect(globalAttentionObjectLabel({ kind: 'analysis', mode: 'reanalyze-range' })).toBe('基线分析 · 重新分析所选范围');
    expect(globalAttentionObjectLabel({ kind: 'review', ordinal: 3 })).toBe('审阅 · 第 3 次');
    // A ledger Task of another kind waiting to start once online, as its own surface names it (Issue #760, S74c).
    expect((['initial-evaluation', 'readers-report', 'evaluation-rewrite', 'writing'] as const).map((taskKind) => globalAttentionObjectLabel({ kind: 'task', taskKind })))
      .toEqual(['AI7 初评', '审稿意见', '按我的评分重写评语', '写作任务']);
    // A 审阅 on the selection 就这段发起任务… handed over says so (Issue #423, S77b).
    expect(globalAttentionObjectLabel({ kind: 'review', ordinal: 4, onSelection: true })).toBe('审阅 · 第 4 次 · 所选段落');
    expect(globalAttentionObjectLabel({ kind: 'recovery', branchName: '主分支' })).toBe('稿件 · 主分支');
    expect(globalAttentionObjectLabel({ kind: 'manuscript-conflict', conflictKind: 'suggestion' })).toBe('修改建议 · 稿件冲突');
    expect(globalAttentionObjectLabel({ kind: 'manuscript-conflict', conflictKind: 'reversal' })).toBe('已应用的修改建议 · 稿件冲突');
    expect(globalAttentionObjectLabel({ kind: 'import', sourceDisplayName: 'sample1.docx', relationship: 'first-manuscript' })).toBe('导入 · sample1.docx · 作为首份稿件导入');
    expect(globalAttentionObjectLabel({ kind: 'import', sourceDisplayName: 'sample1.docx', relationship: null })).toBe('导入 · sample1.docx');
    // Issue #426 (S68b): the case, its classification and the 发稿版本 it is bound to.
    expect(globalAttentionObjectLabel({ kind: 'maintenance', classification: 'supersession', ordinal: 3, publicationOrdinal: 1 })).toBe('维护事项 · 第 3 项 · 替代 · 第 1 次发稿版本');
    // Issue #427 (S79c): a 资料库 item by its kind and title.
    expect(globalAttentionObjectLabel({ kind: 'library-material', title: 'sample1', materialKind: 'book', scope: 'none' })).toBe('资料库 · 图书「sample1」');
    // Issue #428 (S80a): an item whose Material Index was built.
    expect(globalAttentionObjectLabel({ kind: 'library-index', title: 'sample1', materialKind: 'paper', scope: 'house', outcome: 'unsupported' })).toBe('资料索引 · 论文「sample1」');
    // Issue #61 review: only what there is — a Book whose material was all left for later says no 0 条待定.
    expect(globalAttentionObjectLabel({ kind: 'learning-materials', pending: 2, deferred: 0 })).toBe('学习材料 · 2 条待定');
    expect(globalAttentionObjectLabel({ kind: 'learning-materials', pending: 2, deferred: 1 })).toBe('学习材料 · 2 条待定，1 条稍后决定');
    expect(globalAttentionObjectLabel({ kind: 'learning-materials', pending: 0, deferred: 1 })).toBe('学习材料 · 1 条稍后决定');
    // Issue #52 (S17a): a dialogue Task by the editor's own question, cut short at 24 characters.
    expect(globalAttentionObjectLabel({ kind: 'dialogue', question: '这段的叙述视角是否一致？' })).toBe('提问 · 「这段的叙述视角是否一致？」');
    expect(globalAttentionObjectLabel({ kind: 'dialogue', question: `${'问'.repeat(30)}
  ` })).toBe(`提问 · 「${'问'.repeat(24)}…」`);
    expect(globalAttentionObjectLabel({ kind: 'dialogue', question: null })).toBe('提问 · 记录不在本机');
  });

  it('keeps fixed state copy complete without a next-step prefix', () => {
    for (const state of STATES) {
      const reason = globalAttentionReason(item(state));
      expect(reason, state).not.toBe('');
      expect(reason, state).not.toMatch(/…[。！？]?$/u);
      expect(reason, state).not.toContain('安全的下一步：');
    }
    expect(globalAttentionReason(item('analysis-outcome-unknown'))).toBe('回答未完整传回，处理与计费结果待确认，AI7 没有自动重发。');
    expect(globalAttentionReason(item('analysis-prepared'))).toBe('计划已准备好，等待你开始任务。');
    expect(globalAttentionReason(item('analysis-budget-reached', { nextStep: 'redo' }))).toContain('提高启动预算');
    expect(globalAttentionReason(item('analysis-completed-with-gaps', {
      facts: { progress: null, categories: [], revisionOrdinal: 1,
        completion: { gaps: 1, total: 2, reason: '尚未读完'.repeat(50) } },
    }))).toHaveLength(60);
  });

  it('says when, in local time, and as a completion in 最近完成', () => {
    expect(globalAttentionTimeLine('exceptions', AT)).toBe(`记录于 ${localInstantLabel(AT)}`);
    expect(globalAttentionTimeLine('recent', AT)).toBe(`完成于 ${localInstantLabel(AT)}`);
    expect(globalAttentionTimeLine('recent', AT, 'cancelled')).toBe(`取消于 ${localInstantLabel(AT)}`);
    expect(globalAttentionTimeLine('recent', AT, 'stopped')).toBe(`停止于 ${localInstantLabel(AT)}`);
  });

  it('reads as one view: the Book, the object, the state, the reason, the next step and the way in', () => {
    const blocked = item('analysis-blocked', { blocked: true, itemId: 'analysis:blocked' });
    const [exceptions] = globalAttentionView(projection({ exceptions: [blocked] }));
    expect(exceptions!.items).toEqual([{
      itemId: 'analysis:blocked',
      state: 'analysis-blocked',
      book: '《待我处理旅程甲》',
      object: '基线分析 · 首次基线分析',
      stateLabel: '派发前已阻止',
      pill: { tone: 'blocked', shape: 'diamond' },
      reason: '模型服务当前不可用，任务尚未开始。',
      nextStep: '查看运行',
      time: `记录于 ${localInstantLabel(AT)}`,
      openName: '《待我处理旅程甲》 · 基线分析 · 首次基线分析',
    }]);
  });
});

describe('material and knowledge-base items (V2-UX-ATTN-009)', () => {
  it('map into the same four groups and no fifth, and invent no item', () => {
    expect(GLOBAL_ATTENTION_MATERIAL_GROUPS.map((entry) => [entry.label, entry.group])).toEqual([
      ['外部来源留存失败', 'exceptions'],
      ['资料库归属待定', 'decisions'],
      ['学习准入待定', 'decisions'],
      ['学习准入待处理', 'decisions'],
      ['索引完成', 'recent'],
    ]);
    for (const entry of GLOBAL_ATTENTION_MATERIAL_GROUPS) expect(GLOBAL_ATTENTION_GROUP_KEYS).toContain(entry.group);
    // The 资料库 decisions have their records since Issue #427 (S79c): their states carry the table's own words, each in its
    // group. The index has its records since Issue #428 (S80a): 索引完成 is the table's own word, in 最近完成. The retention has
    // none yet, so no state of 待我处理 speaks of one.
    const placed = new Map(GLOBAL_ATTENTION_MATERIAL_GROUPS.map((entry) => [entry.material, entry] as const));
    expect(GLOBAL_ATTENTION_STATE_LABELS['library-attribution-pending']).toBe(placed.get('library-attribution-pending')!.label);
    expect(GLOBAL_ATTENTION_STATE_LABELS['learning-eligibility-pending']).toBe(placed.get('learning-eligibility-pending')!.label);
    expect(GLOBAL_ATTENTION_STATE_LABELS['learning-eligibility-deferred'].startsWith(placed.get('learning-eligibility-pending')!.label)).toBe(true);
    // A Book's Learning Material has its records since Issue #61 (S26b), in the same group under the spec's own words.
    expect(GLOBAL_ATTENTION_STATE_LABELS['learning-materials-pending']).toBe(placed.get('learning-materials-pending')!.label);
    expect(GLOBAL_ATTENTION_STATE_LABELS['learning-materials-deferred'].startsWith(placed.get('learning-materials-pending')!.label)).toBe(true);
    expect(GLOBAL_ATTENTION_STATE_LABELS['indexing-completed']).toBe(placed.get('indexing-completed')!.label);
    expect(placed.get('indexing-completed')!.group).toBe('recent');
    for (const label of Object.values(GLOBAL_ATTENTION_STATE_LABELS)) expect(label).not.toMatch(/留存/u);
    // An item of 资料库 names where it belongs in the Book's place: a Book, the house, or not yet.
    const library = (scope: 'none' | 'book' | 'house', title: string | null) =>
      globalAttentionItemBookLabel({ book: { bookId: title === null ? null : '00000000-0000-4000-8000-000000000000', title }, object: { kind: 'library-material', title: '样书一', materialKind: 'book', scope } });
    expect([library('none', null), library('house', null), library('book', '甲书')]).toEqual(['尚未定归属', '社级', '《甲书》']);
  });
});

// Issue #422 (plan slice S76d; ATTN-003, CLAR-004): a question asked while the Run reads on is only that step's wait.
describe('a Clarification Request in 待我处理 (S76d)', () => {
  it('says whether only its step waits or the whole Task', () => {
    expect(globalAttentionReason(item('analysis-clarification', { blocked: false })))
      .toBe('这个阅读范围正在等你决定是否重试，其他步骤继续处理。');
    expect(GLOBAL_ATTENTION_STATE_PILLS['analysis-clarification']).toEqual({ tone: 'attention', shape: 'triangle' });
  });
});

describe('resumable stop reasons (Issue #1309)', () => {
  it('projects each stop reason into the state label and one actionable explanation', () => {
    const expected = {
      'proxy-unreachable': ['任务已中断 · 代理不可达', '设置 › 模型服务 › 网络代理'],
      'model-service-unreachable': ['任务已中断 · 模型服务不可达', '设置 › 模型服务 › 网络代理'],
      'outcome-unknown': ['任务已中断 · 结果待确认', '查看未确认的部分'],
      shutdown: ['任务已中断 · AI7 关闭时正在运行', '续行时从下一个阅读范围接着读'],
    } as const;
    for (const [reason, [label, action]] of Object.entries(expected)) {
      const entry = item('analysis-resumable', { facts: { progress: null, categories: [], revisionOrdinal: null, stopReason: reason as keyof typeof expected } });
      expect(globalAttentionStateLabel(entry), reason).toBe(label);
      expect(globalAttentionReason(entry), reason).toContain(action);
    }
  });
});

it('warns with N/M unread units and their majority classified reason', () => {
  const view = globalAttentionView(projection({ recent: [item('analysis-completed-with-gaps', {
    facts: { progress: null, categories: [], revisionOrdinal: 1,
      completion: { gaps: 7, total: 8, reason: '模型服务不可达：请检查网络或网络代理设置。' } },
  })] }));
  expect(view.flatMap((group) => group.items)[0]).toMatchObject({
    stateLabel: '已完成 · 7/8 个单元未读成', pill: { tone: 'warn' },
    reason: '模型服务不可达：请检查网络或网络代理设置。',
  });
});
it('selects the most frequent existing gap wording without exposing its technical code', () => {
  const unreachable = '模型服务不可达：请检查网络或网络代理设置。';
  expect(majorityGapReason([
    { code: 'out-of-scope', reason: '未纳入范围' },
    { code: 'outcome-unknown', reason: '该单元结果未知' },
    { code: 'adapter-failure', reason: `${unreachable}（MODEL_SERVICE_UNREACHABLE）` },
    { code: 'adapter-failure', reason: `${unreachable}（MODEL_SERVICE_UNREACHABLE）` },
  ])).toBe(unreachable);
});
