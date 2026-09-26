import { describe, expect, it } from 'vitest';
import * as labels from '../../src/renderer/task-panel-labels.js';
import { composeOptions } from '../../src/renderer/task-panel.js';
import type {
  BaselineAnalysisProjection,
  BookTaskItemProjection,
  GlobalAttentionItemProjection,
  GlobalAttentionStateKey,
} from '../../src/shared/protocol.js';

// Unit suite for the words of the 任务 panel (Issue #423, plan slice S77a; editor-surfaces §1 任务面, V2-UX-TASK-044,
// TASK-045) byte for byte: the panel, what each card offers in each state, 发起全书任务's procedures, 查看结果's window and
// the 回到<位置> chip.

const AT = '2026-09-25T04:05:06.000Z';
const BOOK = '00000000-0000-4000-8000-000000000000';
const TASK = '00000000-0000-4000-8000-000000000001';

function entry(state: GlobalAttentionStateKey, overrides: Partial<GlobalAttentionItemProjection> = {}, result: BookTaskItemProjection['result'] = null): BookTaskItemProjection {
  return {
    item: {
      itemId: `analysis:${TASK}`,
      group: 'active',
      state,
      blocked: false,
      at: AT,
      book: { bookId: BOOK, title: '任务面旅程' },
      object: { kind: 'analysis', mode: 'first-baseline' },
      facts: { progress: null, categories: [], revisionOrdinal: null },
      nextStep: 'view-run',
      target: { kind: 'analysis', bookId: BOOK, taskIntentId: TASK },
      technical: [],
      ...overrides,
    },
    result,
  };
}

const keys = (view: labels.TaskPanelCardView): string[] => view.actions.map((action) => `${action.key}:${action.label}${action.primary ? '*' : ''}`);

describe('the 任务 panel', () => {
  it('names itself, its three groups and what it lists', () => {
    expect(labels.TASK_PANEL_TITLE).toBe('任务');
    expect(labels.taskPanelScopeLine(4)).toBe('这本书 · 4 项');
    expect(labels.TASK_PANEL_NOTE).toBe('这里只列这本书的任务；跨书的待办在「待我处理」。');
    expect(labels.TASK_PANEL_GROUP_LABELS).toEqual({ waiting: '等你处理', running: '进行中', recent: '最近完成' });
    expect(labels.TASK_PANEL_EMPTY_LINES).toEqual({ waiting: '没有等你处理的任务。', running: '没有进行中的任务。', recent: '还没有完成的任务。' });
    expect(labels.taskPanelMoreLine('recent', 10, 10)).toBeNull();
    expect(labels.taskPanelMoreLine('recent', 10, 13)).toBe('只列出最近的 10 项。');
    expect(labels.taskPanelMoreLine('waiting', 50, 57)).toBe('共 57 项，这里列出 50 项。');
    expect(labels.TASK_PANEL_STATUS_LINES).toEqual({ loading: '正在读取这本书的任务…', unavailable: '无法读取这本书的任务。' });
    expect(labels.TASK_PANEL_KIND_LABELS).toEqual({ analysis: '分析任务 · 不需要对话', review: '审阅任务 · 不需要对话' });
    expect(labels.TASK_PANEL_ACTION_LABELS).toEqual({ pause: '暂停', resume: '续行', cancel: '取消任务', plan: '查看计划', result: '查看结果' });
  });

  it('lets a card act only as the drawer’s bar would, and opens everything else where it is decided', () => {
    const running = labels.taskPanelCardView(entry('analysis-running', { facts: { progress: { stage: 'units', unitsSettled: 3, unitsTotal: 8 }, categories: [], revisionOrdinal: null } }));
    expect(running).toMatchObject({ kindLabel: '分析任务 · 不需要对话', title: '基线分析 · 首次基线分析', stateLabel: '运行中', pill: { tone: 'progress', shape: 'half' } });
    expect(running.reason).toBe('正在逐个阅读范围分析 · 已完成 3/8 个阅读范围');
    expect(running.timeLine).toMatch(/^记录于 /u);
    expect(keys(running)).toEqual(['pause:暂停*', 'cancel:取消任务', 'plan:查看计划']);
    expect(keys(labels.taskPanelCardView(entry('analysis-queued')))).toEqual(['cancel:取消任务', 'plan:查看计划']);
    expect(keys(labels.taskPanelCardView(entry('analysis-pausing')))).toEqual(['cancel:取消任务', 'plan:查看计划']);
    expect(keys(labels.taskPanelCardView(entry('analysis-paused')))).toEqual(['resume:续行*', 'cancel:取消任务', 'plan:查看计划']);
    expect(keys(labels.taskPanelCardView(entry('analysis-resumable')))).toEqual(['resume:续行*', 'cancel:取消任务', 'plan:查看计划']);
    for (const state of ['analysis-cancelling', 'analysis-waiting-network', 'analysis-waiting-connection', 'analysis-waiting-slot', 'analysis-waiting-admission'] as const) {
      expect(keys(labels.taskPanelCardView(entry(state)))).toEqual(['plan:查看计划*']);
    }
    // Everything else offers its own next step, in 待我处理's words for it.
    expect(keys(labels.taskPanelCardView(entry('analysis-prepared', { group: 'decisions', nextStep: 'view-plan' })))).toEqual(['next:查看计划并开始*']);
    expect(keys(labels.taskPanelCardView(entry('analysis-clarification', { group: 'decisions', nextStep: 'answer-clarification' })))).toEqual(['next:回答问题*']);
    expect(keys(labels.taskPanelCardView(entry('analysis-plan-revision', { group: 'decisions', nextStep: 'reconfirm-plan' })))).toEqual(['next:重新确认计划*']);
    expect(keys(labels.taskPanelCardView(entry('analysis-failed', { group: 'exceptions' })))).toEqual(['next:查看运行*']);
    const review = labels.taskPanelCardView(entry('review-running', { object: { kind: 'review', ordinal: 2 }, nextStep: 'view-review' }));
    expect([review.kindLabel, review.title, keys(review)]).toEqual(['审阅任务 · 不需要对话', '审阅 · 第 2 次', ['next:查看审阅*']]);
  });

  it('opens a finished Task’s result, and its Run when it formed none', () => {
    const done = labels.taskPanelCardView(entry('analysis-completed', { group: 'recent', facts: { progress: null, categories: [], revisionOrdinal: 2 } }, { kind: 'analysis-revision', revisionId: TASK }));
    expect([done.stateLabel, done.reason, keys(done)]).toEqual(['已完成', '已形成第 2 份基线分析。', ['result:查看结果*']]);
    expect(done.timeLine).toMatch(/^完成于 /u);
    const cancelled = labels.taskPanelCardView(entry('analysis-cancelled', { group: 'recent' }));
    expect([cancelled.stateLabel, cancelled.reason, keys(cancelled)]).toEqual(['已取消', '你取消了这项任务；它还没有读完任何阅读范围，没有形成结果。', ['next:查看运行*']]);
  });
});

describe('发起全书任务', () => {
  it('names the procedures and their actions', () => {
    expect(labels.TASK_PANEL_COMPOSE_HEADING).toBe('发起全书任务');
    expect(labels.TASK_PANEL_COMPOSE_LEDE).toBe('在这本书上发起一项全书工序。准备任务先看计划再开始；快速开始按你设的默认执行规则直接开始。');
    expect(labels.TASK_PANEL_COMPOSE_FIELD).toBe('全书工序');
    expect(labels.TASK_PANEL_COMPOSE_ACTIONS).toEqual({ quick: '快速开始', prepare: '准备任务' });
    expect(labels.TASK_PANEL_COMPOSE_NONE).toBe('这本书现在没有可以发起的全书工序。');
    expect(labels.TASK_PANEL_COMPOSE_FIRST).toEqual({ label: '首次基线分析', meaning: '梳理全书的人物、事件、关系与设定，作为其他任务的底稿。' });
    expect(labels.TASK_PANEL_COMPOSE_FIRST_QUICK).toBe('首次基线分析没有快速开始：先看计划再开始。');
    expect(labels.TASK_PANEL_COMPOSE_STATUS).toEqual({
      preparing: '正在为任务保存修订版…',
      prepared: '任务计划已准备；可在任务计划里开始任务。',
      cancelled: '任务准备已取消；稿件与任务草稿保持不变。',
      failed: '无法准备这项任务。',
    });
  });

  it('offers the first baseline before the Book has one, and the two whole-Book updates after', () => {
    const before = { updateControls: null, actions: { canPrepare: true, canAuthorize: false, canReconfirmPlan: false } } as unknown as BaselineAnalysisProjection;
    expect(composeOptions(before).map((option) => [option.mode, option.available, option.quick.rule, option.quick.reason])).toEqual([
      ['first-baseline', true, null, '首次基线分析没有快速开始：先看计划再开始。'],
    ]);
    expect(composeOptions({ ...before, actions: { canPrepare: false, canAuthorize: false, canReconfirmPlan: false } })).toEqual([]);
    const rule = { ruleId: 'r', ruleVersionId: 'v', name: '同步规则', version: 1 };
    const action = (mode: string, available: boolean, quick: object | undefined) => ({
      mode, label: mode === 'sync-current' ? '同步到当前稿件' : '重新分析全书', goal: `${mode} goal`, meaning: `${mode} meaning`,
      available, unavailableReason: available ? null : '不可用的原因', expected: null, ...(quick === undefined ? {} : { quickStart: quick }),
    });
    const after = (blocked: boolean) => ({
      updateControls: {
        blockedByActiveRun: blocked,
        blockedReason: blocked ? '另一项任务正在运行' : null,
        actions: {
          'sync-current': action('sync-current', true, { available: true, reason: null, rule }),
          'reanalyze-range': action('reanalyze-range', true, undefined),
          'reanalyze-book': action('reanalyze-book', false, { available: false, reason: '没有默认执行规则', rule: null }),
        },
      },
      actions: { canPrepare: false, canAuthorize: false, canReconfirmPlan: false },
    }) as unknown as BaselineAnalysisProjection;
    expect(composeOptions(after(false)).map((option) => [option.mode, option.label, option.available, option.reason, option.quick.rule?.name ?? null, option.quick.reason])).toEqual([
      ['sync-current', '同步到当前稿件', true, null, '同步规则', null],
      ['reanalyze-book', '重新分析全书', false, '不可用的原因', null, '没有默认执行规则'],
    ]);
    // While a Run is under way nothing can start, and each procedure says why in that Run's words.
    expect(composeOptions(after(true)).map((option) => [option.available, option.reason, option.quick.rule])).toEqual([
      [false, '另一项任务正在运行', null],
      [false, '另一项任务正在运行', null],
    ]);
  });
});

describe('查看结果 and 回到<位置>', () => {
  it('names the window, its rows and its way back', () => {
    expect([labels.TASK_RESULT_KIND, labels.TASK_RESULT_CLOSE, labels.TASK_RESULT_JUMP]).toEqual(['任务结果', '关闭', '跳到']);
    expect([labels.TASK_RESULT_LOADING, labels.TASK_RESULT_UNAVAILABLE]).toEqual(['正在读取这项任务的结果…', '无法读取这项任务的结果。']);
    expect(labels.TASK_RESULT_ROWS).toEqual({ task: '任务', read: '读取了', notDone: '没有做' });
    expect(labels.TASK_RESULT_OPEN).toEqual({ analysis: '在分析中打开', review: '在审阅中打开' });
    expect(labels.TASK_RESULT_FOOT_NOTE).toBe('浮窗不改变你在稿件中的位置；跳过去后，稿件顶部会有「回到…」，一键回来。');
    expect(labels.TASK_RESULT_COLUMNS).toEqual({ analysis: ['#', '阅读范围', '结果', '位置'], review: ['#', '类别', '发现', '位置'] });
    expect(labels.taskResultTaskLine(entry('analysis-completed', { group: 'recent' }))).toMatch(/^基线分析 · 首次基线分析 · 完成于 /u);
    expect(labels.analysisResultReadLine({ units: new Array(8).fill(null), manuscriptPin: { revisionLabel: 'r2' } } as never)).toBe('全书 8 个阅读范围 · 稿件修订版 r2');
    expect(labels.ANALYSIS_RESULT_NOT_DONE).toBe('没有修改稿件：分析只读稿件。');
    expect(labels.reviewResultReadLine(['错别字与规范用语', '体例与格式'])).toBe('审阅类别：「错别字与规范用语」「体例与格式」');
    expect(labels.REVIEW_RESULT_NOT_DONE).toBe('没有修改稿件：发现作为标记放在稿件上，由你处理。');
    expect(labels.taskResultRangeTitle(3, null)).toBe('第 3 个阅读范围');
    expect(labels.taskResultRangeTitle(3, '第三章')).toBe('第 3 个阅读范围 · 「第三章」');
    expect(labels.analysisResultUnitLine(null)).toBe('已分析');
    expect(labels.analysisResultUnitLine({ reason: '模型没有按约定作答' })).toBe('尚未分析：模型没有按约定作答');
    expect(labels.reviewResultFindingLine({ quote: '原文', note: '' })).toBe('「原文」');
    expect(labels.reviewResultFindingLine({ quote: '原文', note: '说明'.repeat(40) })).toBe(`${'说明'.repeat(30)}…`);
    expect(labels.reviewResultPlaceLine({ chapterTitle: '第一章', blockPosition: 3 })).toBe('第一章');
    expect(labels.reviewResultPlaceLine({ chapterTitle: null, blockPosition: 3 })).toBe('第 3 个内容块');
    expect(labels.reviewResultPlaceLine({ chapterTitle: null, blockPosition: null })).toBe('已不在当前稿件中');
    expect(labels.reviewResultMoreLine(20, 20)).toBeNull();
    expect(labels.reviewResultMoreLine(20, 34)).toBe('共 34 条发现，这里列出前 20 条；全部在审阅中。');
    expect(labels.REVIEW_RESULT_NONE).toBe('这次审阅没有发现。');
    expect(labels.returnChipPlace('第七章', 40)).toBe('第七章');
    expect(labels.returnChipPlace(null, 40)).toBe('第 40 个内容块');
    expect(labels.returnChipPlace('  ', 40)).toBe('第 40 个内容块');
    expect(labels.returnChipPlace('一个非常非常非常非常非常长的章节标题在这里', 1)).toBe('一个非常非常非常非常非常长的章节…');
    expect(labels.returnChipLabel('第七章')).toBe('回到第七章');
    expect(labels.RETURN_CHIP_TITLE).toBe('回到跳转前的位置');
    expect(labels.returnChipArrived('第七章')).toBe('已回到第七章。');
  });
});
