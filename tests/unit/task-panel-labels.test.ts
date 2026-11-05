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


describe('发起全书任务', () => {
  it('names the procedures and their actions', () => {
    expect(labels.TASK_PANEL_COMPOSE_HEADING).toBe('发起全书任务');
    expect(labels.TASK_PANEL_COMPOSE_LEDE).toBe('选择工序即可开始，任务计划可随时查看。');
    expect(labels.TASK_PANEL_COMPOSE_FIELD).toBe('全书工序');
    expect(labels.TASK_PANEL_COMPOSE_ACTIONS).toEqual({ quick: '快速开始', prepare: '准备任务' });
    expect(labels.TASK_PANEL_COMPOSE_NONE).toBe('导入稿件后即可开始分析。');
    expect(labels.TASK_PANEL_COMPOSE_FIRST).toEqual({ label: '首次基线分析', meaning: '梳理全书的人物、事件、关系与设定，作为其他任务的底稿。' });
    expect(labels.TASK_PANEL_COMPOSE_MEANINGS).toEqual({
      'sync-current': '更新改动涉及的分析，沿用仍适用的结果。',
      'reanalyze-book': '重新通读全书，梳理人物、事件、关系与设定。',
    });
    expect(labels.TASK_PANEL_COMPOSE_FIRST_QUICK).toBe('首次基线分析没有快速开始：先看计划再开始。');
    expect(labels.TASK_PANEL_COMPOSE_STATUS).toEqual({
      preparing: '正在为任务保存修订版…',
      prepared: '任务已开始；可随时查看计划。',
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
    expect(labels.reviewResultPlaceLine({ chapterTitle: null, blockPosition: 3 })).toBe('第 3 段');
    expect(labels.reviewResultPlaceLine({ chapterTitle: null, blockPosition: null })).toBe('已不在当前稿件中');
    expect(labels.reviewResultMoreLine(20, 20)).toBeNull();
    expect(labels.reviewResultMoreLine(20, 34)).toBe('共 34 条发现，这里列出前 20 条；全部在审阅中。');
    expect(labels.REVIEW_RESULT_NONE).toBe('这次审阅没有发现。');
    expect(labels.returnChipPlace('第七章', 40)).toBe('第七章');
    expect(labels.returnChipPlace(null, 40)).toBe('第 40 段');
    expect(labels.returnChipPlace('  ', 40)).toBe('第 40 段');
    expect(labels.returnChipPlace('一个非常非常非常非常非常长的章节标题在这里', 1)).toBe('一个非常非常非常非常非常长的章节…');
    expect(labels.returnChipLabel('第七章')).toBe('回到第七章');
    expect(labels.RETURN_CHIP_TITLE).toBe('回到跳转前的位置');
    expect(labels.returnChipArrived('第七章')).toBe('已回到第七章。');
  });
});

describe('the composer range line (Issue #1176)', () => {
  it('names a span by its first and last block and paragraph count, counting the words without the breaks between them', () => {
    expect(labels.taskComposerRangeLine(5, 12, 'r1')).toBe('第 5 段 · 12 字 · 修订版 r1');
    expect(labels.taskComposerRangeLine(5, 20, 'r1', 3)).toBe('第 5–7 段 · 18 字 · 修订版 r1');
    expect(labels.taskComposerRangeLine(null, 20, 'r1', 3)).toBe('段落已不在当前稿件中 · 18 字 · 修订版 r1');
  });
});
