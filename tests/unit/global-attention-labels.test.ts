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
  GLOBAL_ATTENTION_NEXT_STEP_PREFIX,
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
  globalAttentionTimeLine,
  globalAttentionTruncatedLine,
  globalAttentionView,
} from '../../src/renderer/global-attention-labels.js';
import { localInstantLabel } from '../../src/renderer/plan-preview-labels.js';
import { REVIEW_ACTION_LABELS } from '../../src/renderer/review-labels.js';
import { TASK_BAR_ADJUST_BUDGET_REDO, TASK_BAR_RECONFIRM, TASK_BAR_REDO, TASK_BAR_REPREPARE, TASK_BAR_RESOLVE_MODEL_SERVICE, TASK_BAR_RUN_LINKS } from '../../src/renderer/task-drawer-labels.js';
import { RESOLVE_CONFLICT_LABEL } from '../../src/renderer/editorial-mark-labels.js';
import { PROPOSAL_CONFLICT_CLASSIFICATION } from '../../src/renderer/proposal-conflict-labels.js';
import { REVIEW_RUN_CATEGORY_STATE_LABELS } from '../../src/service/review/review-run-state.js';
import {
  GLOBAL_ATTENTION_GROUP_KEYS,
  GLOBAL_ATTENTION_NEXT_STEPS,
  type GlobalAttentionGroupKey,
  type GlobalAttentionItemProjection,
  type GlobalAttentionProjection,
  type GlobalAttentionStateKey,
} from '../../src/shared/protocol.js';
import { TASK_PLAN_STATE_PILLS } from '../../src/renderer/task-drawer-labels.js';

// Unit suite for 待我处理's words (Issue #424, plan slice S78; editor-surfaces §8.1, V2-UX-ATTN-001 to 009):
// every group heading, state, reason and safe next step byte for byte; the next steps pinned to the words the
// product already uses at each record; and the ATTN-009 material table. The renderer's view model is pure,
// so the whole screen is read here without a DOM.

const RENDERER = readFileSync(fileURLToPath(new URL('../../src/renderer/index.ts', import.meta.url)), 'utf8');
const AT = '2026-09-23T04:05:06.000Z';

const STATES: ReadonlyArray<GlobalAttentionStateKey> = [
  'import-outcome-uncertain', 'import-cleanup-pending', 'recovery-pending', 'recovery-deferred',
  'manuscript-conflict', 'manuscript-conflict-deferred', 'analysis-failed',
  'analysis-interrupted', 'analysis-budget-reached', 'analysis-account-limit', 'analysis-blocked', 'analysis-orphaned', 'review-failed', 'review-stopped',
  'analysis-plan-revision', 'analysis-plan-moved', 'analysis-clarification', 'analysis-queued', 'analysis-running', 'analysis-waiting-network', 'analysis-waiting-connection',
  'analysis-waiting-slot', 'analysis-waiting-admission', 'analysis-waiting-capacity', 'analysis-cancelling', 'analysis-pausing', 'analysis-paused', 'analysis-resumable',
  'review-running', 'review-continuable',
  'analysis-completed', 'analysis-completed-with-gaps', 'review-completed',
  'analysis-prepared', 'review-prepared', 'analysis-cancelled',
  'maintenance-pending', 'maintenance-waiting',
  'library-attribution-pending', 'learning-eligibility-pending', 'learning-eligibility-deferred',
  'learning-materials-pending', 'learning-materials-deferred',
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
  return { groups: built, actionableCount: built[0]!.total + built[1]!.total, running: false };
}

describe('the entry and the screen', () => {
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
      'analysis-waiting-slot': '等待运行名额',
      'analysis-waiting-admission': '正在排队',
      'analysis-waiting-capacity': '等待运行名额',
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
    });
    // The drawer's own words for the way on from a Run the ceiling stopped (Issue #51, S16a).
    expect(GLOBAL_ATTENTION_NEXT_STEP_LABELS['adjust-budget-redo']).toBe(TASK_BAR_ADJUST_BUDGET_REDO);
    expect(GLOBAL_ATTENTION_STATE_PILLS['analysis-budget-reached'].shape).not.toBe(GLOBAL_ATTENTION_STATE_PILLS['analysis-running'].shape);
    // A Provider Account Limit's remediation route (Issue #51, S16b), the drawer's own words for it.
    expect(GLOBAL_ATTENTION_NEXT_STEP_LABELS['resolve-model-service']).toBe(TASK_BAR_RESOLVE_MODEL_SERVICE);
    expect(GLOBAL_ATTENTION_STATE_PILLS['analysis-account-limit'].shape).not.toBe(GLOBAL_ATTENTION_STATE_PILLS['analysis-resumable'].shape);
    // A waiting Run whose plan moved (Issue #536; OFF-008): the drawer's own words and pill, never 派发前已阻止's.
    expect(GLOBAL_ATTENTION_NEXT_STEP_LABELS.reprepare).toBe(TASK_BAR_REPREPARE);
    // A Run the launch's ceiling stopped under developer-live (Issue #541): the drawer's 改计划重做, and words that say the
    // ceiling was the launch's and a relaunch raises it.
    expect(GLOBAL_ATTENTION_NEXT_STEP_LABELS.redo).toBe(TASK_BAR_REDO);
    expect(globalAttentionReason(item('analysis-budget-reached', { nextStep: 'redo' })))
      .toBe('运行用到了这次启动的预算上限，已停止；读完的部分已保留。要接着读，请以更高的预算上限重新启动，再改计划重做。');
    expect(GLOBAL_ATTENTION_STATE_PILLS['analysis-plan-moved']).toEqual(TASK_PLAN_STATE_PILLS['plan-moved']);
    expect(GLOBAL_ATTENTION_STATE_PILLS['analysis-plan-moved']).not.toEqual(GLOBAL_ATTENTION_STATE_PILLS['analysis-blocked']);
    // Pinned to the words the record's own surface uses there.
    expect(GLOBAL_ATTENTION_NEXT_STEP_LABELS['resolve-conflict']).toBe(RESOLVE_CONFLICT_LABEL);
    expect(GLOBAL_ATTENTION_STATE_LABELS['manuscript-conflict']).toBe(PROPOSAL_CONFLICT_CLASSIFICATION);
    expect(GLOBAL_ATTENTION_NEXT_STEP_LABELS['view-run']).toBe(TASK_BAR_RUN_LINKS['baseline-analysis']);
    expect(GLOBAL_ATTENTION_NEXT_STEP_LABELS['view-review']).toBe(TASK_BAR_RUN_LINKS['review-run']);
    expect(GLOBAL_ATTENTION_NEXT_STEP_LABELS['reconfirm-plan']).toBe(TASK_BAR_RECONFIRM);
    expect(GLOBAL_ATTENTION_NEXT_STEP_LABELS['continue-review']).toBe(REVIEW_ACTION_LABELS.continue);
    expect(RENDERER).toContain(`button('${GLOBAL_ATTENTION_NEXT_STEP_LABELS['return-to-recovery']}'`);
    expect(RENDERER).toContain(`button('${GLOBAL_ATTENTION_NEXT_STEP_LABELS['retry-abandon-cleanup']}'`);
    expect(RENDERER).toContain(`${GLOBAL_ATTENTION_NEXT_STEP_LABELS['await-local-check']}；不要重复导入`);
    expect(RENDERER).toContain(`\`${GLOBAL_ATTENTION_NEXT_STEP_PREFIX}\${`);
    expect(globalAttentionNextStepLine('reconfirm-plan')).toBe('安全的下一步：重新确认计划');
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
    expect(globalAttentionObjectLabel({ kind: 'recovery', branchName: '主分支' })).toBe('稿件 · 主分支');
    expect(globalAttentionObjectLabel({ kind: 'manuscript-conflict', conflictKind: 'suggestion' })).toBe('修改建议 · 稿件冲突');
    expect(globalAttentionObjectLabel({ kind: 'manuscript-conflict', conflictKind: 'reversal' })).toBe('已应用的修改建议 · 稿件冲突');
    expect(globalAttentionObjectLabel({ kind: 'import', sourceDisplayName: 'sample1.docx', relationship: 'first-manuscript' })).toBe('导入 · sample1.docx · 作为首份稿件导入');
    expect(globalAttentionObjectLabel({ kind: 'import', sourceDisplayName: 'sample1.docx', relationship: null })).toBe('导入 · sample1.docx');
    // Issue #426 (S68b): the case, its classification and the 发稿版本 it is bound to.
    expect(globalAttentionObjectLabel({ kind: 'maintenance', classification: 'supersession', ordinal: 3, publicationOrdinal: 1 })).toBe('维护事项 · 第 3 项 · 替代 · 第 1 次发稿版本');
    // Issue #427 (S79c): a 资料库 item by its kind and title.
    expect(globalAttentionObjectLabel({ kind: 'library-material', title: 'sample1', materialKind: 'book', scope: 'none' })).toBe('资料库 · 图书「sample1」');
    // Issue #61 review: only what there is — a Book whose material was all left for later says no 0 条待定.
    expect(globalAttentionObjectLabel({ kind: 'learning-materials', pending: 2, deferred: 0 })).toBe('学习材料 · 2 条待定');
    expect(globalAttentionObjectLabel({ kind: 'learning-materials', pending: 2, deferred: 1 })).toBe('学习材料 · 2 条待定，1 条稍后决定');
    expect(globalAttentionObjectLabel({ kind: 'learning-materials', pending: 0, deferred: 1 })).toBe('学习材料 · 1 条稍后决定');
  });

  it('gives each state its reason, from the record\'s own facts', () => {
    const categories = (entries: ReadonlyArray<[string, 'failed' | 'refused' | 'interrupted' | 'running' | 'waiting' | 'settled', string | null]>): GlobalAttentionItemProjection['facts']['categories'] =>
      entries.map(([label, state, detail]) => ({ label, state, stateLabel: REVIEW_RUN_CATEGORY_STATE_LABELS[state], detail }));
    const reasons: Record<GlobalAttentionStateKey, string> = {
      'import-outcome-uncertain': globalAttentionReason(item('import-outcome-uncertain')),
      'import-cleanup-pending': globalAttentionReason(item('import-cleanup-pending')),
      'recovery-pending': globalAttentionReason(item('recovery-pending')),
      'recovery-deferred': globalAttentionReason(item('recovery-deferred')),
      'manuscript-conflict': globalAttentionReason(item('manuscript-conflict', { object: { kind: 'manuscript-conflict', conflictKind: 'suggestion' } })),
      'manuscript-conflict-deferred': globalAttentionReason(item('manuscript-conflict-deferred', { object: { kind: 'manuscript-conflict', conflictKind: 'reversal' } })),
      'analysis-failed': globalAttentionReason(item('analysis-failed')),
      'analysis-interrupted': globalAttentionReason(item('analysis-interrupted')),
      'analysis-budget-reached': globalAttentionReason(item('analysis-budget-reached')),
      'analysis-account-limit': globalAttentionReason(item('analysis-account-limit')),
      'analysis-blocked': globalAttentionReason(item('analysis-blocked')),
      'analysis-orphaned': globalAttentionReason(item('analysis-orphaned')),
      'review-failed': globalAttentionReason(item('review-failed', { facts: { progress: null, revisionOrdinal: null, categories: categories([['错别字与规范用语', 'failed', null], ['体例与格式', 'refused', null]]) } })),
      'review-stopped': globalAttentionReason(item('review-stopped', { facts: { progress: null, revisionOrdinal: null, categories: categories([['事实核查', 'interrupted', null]]) } })),
      'analysis-plan-revision': globalAttentionReason(item('analysis-plan-revision')),
      'analysis-plan-moved': globalAttentionReason(item('analysis-plan-moved')),
      'analysis-clarification': globalAttentionReason(item('analysis-clarification', { blocked: true })),
      'analysis-queued': globalAttentionReason(item('analysis-queued')),
      'analysis-running': globalAttentionReason(item('analysis-running', { facts: { progress: { stage: 'units', unitsSettled: 3, unitsTotal: 8 }, categories: [], revisionOrdinal: null } })),
      'analysis-waiting-network': globalAttentionReason(item('analysis-waiting-network')),
      'analysis-waiting-connection': globalAttentionReason(item('analysis-waiting-connection')),
      'analysis-waiting-slot': globalAttentionReason(item('analysis-waiting-slot')),
      'analysis-waiting-admission': globalAttentionReason(item('analysis-waiting-admission')),
      'analysis-waiting-capacity': globalAttentionReason(item('analysis-waiting-capacity')),
      'analysis-cancelling': globalAttentionReason(item('analysis-cancelling', { facts: { progress: { stage: 'units', unitsSettled: 2, unitsTotal: 8 }, categories: [], revisionOrdinal: null } })),
      'analysis-pausing': globalAttentionReason(item('analysis-pausing', { facts: { progress: { stage: 'units', unitsSettled: 2, unitsTotal: 8 }, categories: [], revisionOrdinal: null } })),
      'analysis-paused': globalAttentionReason(item('analysis-paused')),
      'analysis-resumable': globalAttentionReason(item('analysis-resumable')),
      'review-running': globalAttentionReason(item('review-running', { facts: { progress: { stage: 'cross-unit-reduction', unitsSettled: 8, unitsTotal: 8 }, categories: categories([['体例与格式', 'running', null]]), revisionOrdinal: null } })),
      'review-continuable': globalAttentionReason(item('review-continuable', { facts: { progress: null, categories: categories([['体例与格式', 'waiting', '尚未开始；继续审阅时从这一类接着审。']]), revisionOrdinal: null } })),
      'analysis-completed': globalAttentionReason(item('analysis-completed', { facts: { progress: null, categories: [], revisionOrdinal: 1 } })),
      'analysis-completed-with-gaps': globalAttentionReason(item('analysis-completed-with-gaps', { facts: { progress: null, categories: [], revisionOrdinal: 4 } })),
      'review-completed': globalAttentionReason(item('review-completed', { facts: { progress: null, categories: categories([['错别字与规范用语', 'settled', null], ['体例与格式', 'settled', null]]), revisionOrdinal: null } })),
      'analysis-prepared': globalAttentionReason(item('analysis-prepared')),
      'review-prepared': globalAttentionReason(item('review-prepared', { facts: { progress: null, revisionOrdinal: null, categories: categories([['错别字与规范用语', 'waiting', null], ['体例与格式', 'waiting', null]]) } })),
      'analysis-cancelled': globalAttentionReason(item('analysis-cancelled', { facts: { progress: null, categories: [], revisionOrdinal: 2 } })),
      'maintenance-pending': globalAttentionReason(item('maintenance-pending', {
        object: { kind: 'maintenance', classification: 'errata', ordinal: 1, publicationOrdinal: 1 }, nextStep: 'maintenance-write-errata',
      })),
      'maintenance-waiting': globalAttentionReason(item('maintenance-waiting', {
        object: { kind: 'maintenance', classification: 'supersession', ordinal: 3, publicationOrdinal: 1 }, nextStep: 'maintenance-link-publication',
      })),
      'library-attribution-pending': globalAttentionReason(item('library-attribution-pending', {
        object: { kind: 'library-material', title: '参考书', materialKind: 'book', scope: 'none' }, nextStep: 'set-library-attribution',
      })),
      'learning-eligibility-pending': globalAttentionReason(item('learning-eligibility-pending', {
        object: { kind: 'library-material', title: '参考书', materialKind: 'book', scope: 'book' }, nextStep: 'set-learning-eligibility',
      })),
      'learning-eligibility-deferred': globalAttentionReason(item('learning-eligibility-deferred', {
        object: { kind: 'library-material', title: '参考书', materialKind: 'book', scope: 'house' }, nextStep: 'set-learning-eligibility',
      })),
      'learning-materials-pending': globalAttentionReason(item('learning-materials-pending', {
        object: { kind: 'learning-materials', pending: 2, deferred: 0 }, nextStep: 'decide-learning-materials',
      })),
      'learning-materials-deferred': globalAttentionReason(item('learning-materials-deferred', {
        object: { kind: 'learning-materials', pending: 0, deferred: 1 }, nextStep: 'decide-learning-materials',
      })),
    };
    expect(reasons).toEqual({
      'import-outcome-uncertain': '本地证据目前无法证明这次原子提交已经完成或确定未提交；已阻止重试、放弃和清理。',
      'import-cleanup-pending': '放弃意图已经持久化，安全清理尚未完成；已阻止继续导入和新权威引用。',
      'recovery-pending': '中断后的稿件状态需要你确认；系统不会替你选择恢复来源。',
      'recovery-deferred': '该分支已稍后处理，普通编辑保持只读；请返回恢复比较作出决定。',
      'manuscript-conflict': '建议所依据的原文已经改过；在解决之前不能接受或应用这条建议。',
      'manuscript-conflict-deferred': '撤销这次应用时遇到冲突：应用后的文字又改过；在解决之前不能撤销这次应用。已记下暂不处理，这处冲突仍未解决。',
      'analysis-failed': '运行失败，没有形成新的结果集修订版。',
      'analysis-interrupted': '运行已在派发后中断；已完成单元的结果与缺口均已保留。',
      'analysis-budget-reached': '运行用到了你设的预算上限，已停止；读完的部分已保留。要接着读，请调整预算并重做。',
      'analysis-account-limit': '模型服务按账户限额拒绝了请求，这项任务已停下，读完的部分都已保存；处理好模型服务、限额解除后续行。',
      'analysis-blocked': '授权已记录，派发前阻止：当前启动没有可执行的路由。',
      'analysis-orphaned': '服务在这次运行期间停止，运行已中断；已完成单元的结果与缺口保留在分析账本中。',
      'review-failed': '「错别字与规范用语」运行失败；「体例与格式」未能开始',
      'review-stopped': '「事实核查」已中断',
      'analysis-plan-revision': '计划冻结之后，它的关键内容已经变化；原计划不能再开始。',
      // Issue #536 (OFF-008): a waiting Run whose plan moved never starts; the plan's 重新准备 is the way on.
      'analysis-plan-moved': '它等待联网时，计划依据的内容已经变化；这次授权不再对应当前的情况，它不会开始。',
      // Issue #422 (S76d; CLAR-004): the Task waits for the answer; a question asked while the Run reads on says so.
      'analysis-clarification': '任务等待你的说明：它想知道要不要把一个阅读范围安全地再试一次。',
      'analysis-queued': '已进入 AI7 调度器。',
      'analysis-running': '正在逐个阅读范围分析 · 已完成 3/8 个阅读范围',
      'analysis-waiting-network': '联网后开始任务：恢复联网后，AI7 先核对计划再开始；现在什么都没有运行。',
      'analysis-waiting-connection': '模型连接缺少凭据：到设置连接模型服务后，任务会在联网时开始。',
      'analysis-waiting-slot': '运行名额已满：正在运行的任务结束后，这项任务在联网时开始。',
      // Issue #539: online with nothing in its way, it is not in the scheduler yet.
      'analysis-waiting-admission': '已经联网：AI7 先核对计划，没有变化就开始；现在什么都没有运行。',
      // Issue #49 (S14; CONC-007): a start waiting on the governor for a place.
      'analysis-waiting-capacity': '运行名额已满：正在运行的任务结束后，这项任务自动开始；在此之前什么都没有发送。',
      'analysis-cancelling': '你取消了这项任务；正在进行的这一步完成后停止，之后不再发送任何内容 · 正在逐个阅读范围分析 · 已完成 2/8 个阅读范围',
      'analysis-pausing': '你暂停了这项任务；正在进行的这一步完成后停下，已完成的部分都会保存 · 正在逐个阅读范围分析 · 已完成 2/8 个阅读范围',
      'analysis-paused': '已暂停：已读完的阅读范围都已保存；续行时从下一个接着读，也可以取消它。',
      'analysis-resumable': 'AI7 关闭时这项任务正在运行；已读完的阅读范围都已保存。续行时从下一个接着读，在此之前不会发送任何内容。',
      'review-running': '正在审阅「体例与格式」 · 正在跨范围比对',
      'review-continuable': '「体例与格式」尚未开始；继续审阅时从这一类接着审。',
      'analysis-completed': '已形成第 1 份基线分析。',
      'analysis-completed-with-gaps': '已形成第 4 份基线分析，保留缺口单元。',
      'review-completed': '已审：「错别字与规范用语」「体例与格式」；发现已标到稿件上。',
      // Issue #423 (S77a; TASK-044): the 任务 panel's own three; nothing starts by itself, and a cancellation keeps what was read.
      'analysis-prepared': '计划已准备好，还没有开始；查看计划后开始任务。它不会自己开始。',
      'review-prepared': '审阅计划已准备好，还没有开始：「错别字与规范用语」「体例与格式」；查看计划后开始审阅。它不会自己开始。',
      'analysis-cancelled': '你取消了这项任务；读完的阅读范围已形成第 2 份基线分析。',
      // Issue #426 (S68b; MAINT-012): what the case waits on; nothing outside AI7 is claimed.
      'maintenance-pending': '勘误还没有写下内容：在这个维护事项中编写勘误。',
      'maintenance-waiting': '替代等待另设的发稿版本：另行设为发稿版本后，在这个维护事项中关联它。',
      // Issue #427 (S79c; KB-007, LEARN-006): what a 资料库 item waits for; nothing about it is inferred meanwhile.
      'library-attribution-pending': '放进资料库以后还没有定归属：定了归属与学习准入，任务才能把它列进「允许参考」。',
      'learning-eligibility-pending': '归属已定，学习准入还没有定：没有你的决定，它不会用来学习，任务也还不能把它列进「允许参考」。',
      'learning-eligibility-deferred': '学习准入记为稍后决定：决定之前，它不会用来学习，任务也还不能把它列进「允许参考」。',
      'learning-materials-pending': '你的反馈与改动里有可以用来学习的材料：学习准入策略还只是建议，没有你的决定，它们不会用来学习。',
      'learning-materials-deferred': '这些学习材料记为稍后决定：决定之前，它们不会用来学习。',
    });
    const maintenance = (classification: 'correction' | 'reissue', nextStep: 'maintenance-link-proposal' | 'maintenance-link-publication' | 'maintenance-conclude') =>
      globalAttentionReason(item(classification === 'reissue' ? 'maintenance-waiting' : 'maintenance-pending', {
        object: { kind: 'maintenance', classification, ordinal: 2, publicationOrdinal: 1 }, nextStep,
      }));
    expect(maintenance('correction', 'maintenance-link-proposal')).toBe('更正还没有关联修改建议：先在稿件中提出修改建议，再在这个维护事项中关联它。');
    expect(maintenance('correction', 'maintenance-link-publication')).toBe('修改建议已关联：更正后的文字另行保存里程碑版本、设为发稿版本后，在这个维护事项中关联它。');
    expect(maintenance('correction', 'maintenance-conclude')).toBe('这个维护事项的步骤已经记录：在这个维护事项中记录它的结论。');
    expect(maintenance('reissue', 'maintenance-link-publication')).toBe('再版等待另设的发稿版本：另行设为发稿版本后，在这个维护事项中关联它。');
    // Only a 更正 reads 修改建议已关联: a 替代 read as pending still says what it waits for.
    expect(globalAttentionReason(item('maintenance-pending', {
      object: { kind: 'maintenance', classification: 'supersession', ordinal: 3, publicationOrdinal: 1 }, nextStep: 'maintenance-link-publication',
    }))).toBe('替代等待另设的发稿版本：另行设为发稿版本后，在这个维护事项中关联它。');
    // The recovery reason of a deferred state is the landing's own sentence, word for word.
    expect(RENDERER).toContain(`'${reasons['recovery-deferred']}'`);
  });

  it('says when, in local time, and as a completion in 最近完成', () => {
    expect(globalAttentionTimeLine('exceptions', AT)).toBe(`记录于 ${localInstantLabel(AT)}`);
    expect(globalAttentionTimeLine('recent', AT)).toBe(`完成于 ${localInstantLabel(AT)}`);
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
      reason: '授权已记录，派发前阻止：当前启动没有可执行的路由。',
      nextStep: '安全的下一步：查看运行',
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
    // group. The retention and the index have none yet, so no state of 待我处理 speaks of one.
    const placed = new Map(GLOBAL_ATTENTION_MATERIAL_GROUPS.map((entry) => [entry.material, entry] as const));
    expect(GLOBAL_ATTENTION_STATE_LABELS['library-attribution-pending']).toBe(placed.get('library-attribution-pending')!.label);
    expect(GLOBAL_ATTENTION_STATE_LABELS['learning-eligibility-pending']).toBe(placed.get('learning-eligibility-pending')!.label);
    expect(GLOBAL_ATTENTION_STATE_LABELS['learning-eligibility-deferred'].startsWith(placed.get('learning-eligibility-pending')!.label)).toBe(true);
    // A Book's Learning Material has its records since Issue #61 (S26b), in the same group under the spec's own words.
    expect(GLOBAL_ATTENTION_STATE_LABELS['learning-materials-pending']).toBe(placed.get('learning-materials-pending')!.label);
    expect(GLOBAL_ATTENTION_STATE_LABELS['learning-materials-deferred'].startsWith(placed.get('learning-materials-pending')!.label)).toBe(true);
    for (const label of Object.values(GLOBAL_ATTENTION_STATE_LABELS)) expect(label).not.toMatch(/留存|索引/u);
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
      .toBe('该步骤等待说明 · 其他步骤仍在继续：它想知道要不要把一个阅读范围安全地再试一次。');
    expect(GLOBAL_ATTENTION_STATE_PILLS['analysis-clarification']).toEqual({ tone: 'attention', shape: 'triangle' });
  });
});
