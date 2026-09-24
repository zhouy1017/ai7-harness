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
import { TASK_BAR_ADJUST_BUDGET_REDO, TASK_BAR_RECONFIRM, TASK_BAR_RESOLVE_MODEL_SERVICE, TASK_BAR_RUN_LINKS } from '../../src/renderer/task-drawer-labels.js';
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
  'analysis-plan-revision', 'analysis-clarification', 'analysis-queued', 'analysis-running', 'analysis-waiting-network', 'analysis-waiting-connection',
  'analysis-waiting-slot', 'analysis-cancelling', 'analysis-pausing', 'analysis-paused', 'analysis-resumable',
  'review-running', 'review-continuable',
  'analysis-completed', 'analysis-completed-with-gaps', 'review-completed',
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
      'analysis-clarification': '等你回答',
      'analysis-queued': '正在排队',
      'analysis-running': '运行中',
      'analysis-waiting-network': '等待网络',
      'analysis-waiting-connection': '需要处理模型连接',
      'analysis-waiting-slot': '等待运行名额',
      'analysis-cancelling': '正在取消',
      'analysis-pausing': '正在暂停',
      'analysis-paused': '已暂停',
      'analysis-resumable': '任务已中断 · 可续行',
      'review-running': '运行中',
      'review-continuable': '中途停止 · 可继续审阅',
      'analysis-completed': '已完成',
      'analysis-completed-with-gaps': '已完成 · 保留缺口',
      'review-completed': '已完成',
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
    });
    // The drawer's own words for the way on from a Run the ceiling stopped (Issue #51, S16a).
    expect(GLOBAL_ATTENTION_NEXT_STEP_LABELS['adjust-budget-redo']).toBe(TASK_BAR_ADJUST_BUDGET_REDO);
    expect(GLOBAL_ATTENTION_STATE_PILLS['analysis-budget-reached'].shape).not.toBe(GLOBAL_ATTENTION_STATE_PILLS['analysis-running'].shape);
    // A Provider Account Limit's remediation route (Issue #51, S16b), the drawer's own words for it.
    expect(GLOBAL_ATTENTION_NEXT_STEP_LABELS['resolve-model-service']).toBe(TASK_BAR_RESOLVE_MODEL_SERVICE);
    expect(GLOBAL_ATTENTION_STATE_PILLS['analysis-account-limit'].shape).not.toBe(GLOBAL_ATTENTION_STATE_PILLS['analysis-resumable'].shape);
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
      'analysis-clarification': globalAttentionReason(item('analysis-clarification', { blocked: true })),
      'analysis-queued': globalAttentionReason(item('analysis-queued')),
      'analysis-running': globalAttentionReason(item('analysis-running', { facts: { progress: { stage: 'units', unitsSettled: 3, unitsTotal: 8 }, categories: [], revisionOrdinal: null } })),
      'analysis-waiting-network': globalAttentionReason(item('analysis-waiting-network')),
      'analysis-waiting-connection': globalAttentionReason(item('analysis-waiting-connection')),
      'analysis-waiting-slot': globalAttentionReason(item('analysis-waiting-slot')),
      'analysis-cancelling': globalAttentionReason(item('analysis-cancelling', { facts: { progress: { stage: 'units', unitsSettled: 2, unitsTotal: 8 }, categories: [], revisionOrdinal: null } })),
      'analysis-pausing': globalAttentionReason(item('analysis-pausing', { facts: { progress: { stage: 'units', unitsSettled: 2, unitsTotal: 8 }, categories: [], revisionOrdinal: null } })),
      'analysis-paused': globalAttentionReason(item('analysis-paused')),
      'analysis-resumable': globalAttentionReason(item('analysis-resumable')),
      'review-running': globalAttentionReason(item('review-running', { facts: { progress: { stage: 'cross-unit-reduction', unitsSettled: 8, unitsTotal: 8 }, categories: categories([['体例与格式', 'running', null]]), revisionOrdinal: null } })),
      'review-continuable': globalAttentionReason(item('review-continuable', { facts: { progress: null, categories: categories([['体例与格式', 'waiting', '尚未开始；继续审阅时从这一类接着审。']]), revisionOrdinal: null } })),
      'analysis-completed': globalAttentionReason(item('analysis-completed', { facts: { progress: null, categories: [], revisionOrdinal: 1 } })),
      'analysis-completed-with-gaps': globalAttentionReason(item('analysis-completed-with-gaps', { facts: { progress: null, categories: [], revisionOrdinal: 4 } })),
      'review-completed': globalAttentionReason(item('review-completed', { facts: { progress: null, categories: categories([['错别字与规范用语', 'settled', null], ['体例与格式', 'settled', null]]), revisionOrdinal: null } })),
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
      // Issue #422 (S76d; CLAR-004): the Task waits for the answer; a question asked while the Run reads on says so.
      'analysis-clarification': '任务等待你的说明：它想知道要不要把一个阅读范围安全地再试一次。',
      'analysis-queued': '已进入 AI7 调度器（单槽位）。',
      'analysis-running': '正在逐个阅读范围分析 · 已完成 3/8 个阅读范围',
      'analysis-waiting-network': '联网后开始任务：恢复联网后，AI7 先核对计划再开始；现在什么都没有运行。',
      'analysis-waiting-connection': '模型连接缺少凭据：到设置连接模型服务后，任务会在联网时开始。',
      'analysis-waiting-slot': '另一项任务正在运行；它结束后，这项任务在联网时开始。',
      'analysis-cancelling': '你取消了这项任务；正在进行的这一步完成后停止，之后不再发送任何内容 · 正在逐个阅读范围分析 · 已完成 2/8 个阅读范围',
      'analysis-pausing': '你暂停了这项任务；正在进行的这一步完成后停下，已完成的部分都会保存 · 正在逐个阅读范围分析 · 已完成 2/8 个阅读范围',
      'analysis-paused': '已暂停：已读完的阅读范围都已保存；续行时从下一个接着读，也可以取消它。',
      'analysis-resumable': 'AI7 关闭时这项任务正在运行；已读完的阅读范围都已保存。续行时从下一个接着读，在此之前不会发送任何内容。',
      'review-running': '正在审阅「体例与格式」 · 正在跨范围比对',
      'review-continuable': '「体例与格式」尚未开始；继续审阅时从这一类接着审。',
      'analysis-completed': '已形成第 1 份基线分析。',
      'analysis-completed-with-gaps': '已形成第 4 份基线分析，保留缺口单元。',
      'review-completed': '已审：「错别字与规范用语」「体例与格式」；发现已标到稿件上。',
    });
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
      ['索引完成', 'recent'],
    ]);
    for (const entry of GLOBAL_ATTENTION_MATERIAL_GROUPS) expect(GLOBAL_ATTENTION_GROUP_KEYS).toContain(entry.group);
    // None of these records exists yet, so no state of 待我处理 speaks of one.
    for (const label of Object.values(GLOBAL_ATTENTION_STATE_LABELS)) expect(label).not.toMatch(/留存|资料库|学习准入|索引/u);
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
