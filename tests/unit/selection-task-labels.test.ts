import { describe, expect, it } from 'vitest';
import type { BaselineAnalysisProjection, ReviewWorkspaceProjection } from '../../src/shared/protocol.js';
import {
  SELECTION_PRESET_REASON,
  SELECTION_TASK_FIELD,
  SELECTION_TASK_MENU_LABEL,
  SELECTION_TASK_NOTE,
  SELECTION_TASK_NO_BASELINE,
  SELECTION_TASK_NO_CATEGORY,
  SELECTION_TASK_PREPARE,
  SELECTION_TASK_REANALYZE,
  SELECTION_TASK_STATUS,
  SELECTION_TASK_TITLE,
  selectionTaskChoices,
  selectionTaskContextLine,
  selectionTaskNoneLine,
  selectionTaskReviewLabel,
} from '../../src/renderer/selection-task-labels.js';

// Unit suite for 就这段发起任务… (Issue #423, S77b; TASK-001, TASK-046): every word byte for byte, and what the composer offers
// from ②A's and ②B's own projections — no store, no manuscript.

type Controls = NonNullable<BaselineAnalysisProjection['updateControls']>;
const GOAL = '重新分析所选范围的固定任务目标';

function analysis(range: { available: boolean; unavailableReason: string | null } | null, blocked: string | null = null): Pick<BaselineAnalysisProjection, 'updateControls'> {
  if (range === null) return { updateControls: null };
  const action = { ...range, goal: GOAL };
  return {
    updateControls: {
      blockedByActiveRun: blocked !== null,
      blockedReason: blocked,
      actions: { 'reanalyze-range': action } as unknown as Controls['actions'],
    } as unknown as Controls,
  };
}

type Category = ReviewWorkspaceProjection['categories'][number];
function category(categoryId: string, label: string, available: boolean, selection: boolean): Category {
  const off = { available: false, unavailableReason: '不可用' };
  const on = { available: true, unavailableReason: null };
  return {
    categoryId,
    label,
    available,
    scopes: { whole: on, chapters: on, changed: off, selection: selection ? on : off },
  } as unknown as Category;
}

function workspace(categories: Category[], newReview = { available: true, unavailableReason: null as string | null }): Pick<ReviewWorkspaceProjection, 'categories' | 'newReview'> {
  return { categories, newReview };
}

describe('the words of 就这段发起任务…', () => {
  it('names the entry, the composer, its one field, its one action and what it hands over', () => {
    expect(SELECTION_TASK_MENU_LABEL).toBe('就这段发起任务…');
    expect(SELECTION_TASK_TITLE).toBe('就这段发起任务');
    expect(SELECTION_TASK_FIELD).toBe('工序');
    expect(SELECTION_TASK_PREPARE).toBe('准备任务');
    expect(SELECTION_TASK_NOTE).toBe('只把所选文字所在的这一段交给任务，按包含它的阅读范围读取，计划里写明读哪些范围，不会扩大到全书。准备任务先打开计划，由你开始；就选区发起的任务没有快速开始。');
    expect(selectionTaskContextLine(12, 7)).toBe('已选 12 字 · 第 7 个内容块');
    expect(SELECTION_TASK_REANALYZE).toBe('重新分析这段');
    expect(selectionTaskReviewLabel('错别字与规范用语')).toBe('审阅这段 · 「错别字与规范用语」');
    expect(SELECTION_PRESET_REASON).toBe('本社常用工序就选区运行尚未接通');
    expect(selectionTaskNoneLine([SELECTION_TASK_NO_BASELINE, SELECTION_TASK_NO_CATEGORY]))
      .toBe('就这段现在没有可以发起的工序。重新分析这段要先完成首次基线分析。没有能审阅所选文字的审阅类别。');
    expect(SELECTION_TASK_STATUS).toEqual({
      reading: '正在读取可以就这段发起的工序…',
      unreadable: '无法读取可以就这段发起的工序。',
      choose: '选一项工序；准备任务会先打开它的计划。',
      pickFirst: '请先选择一项工序。',
      gone: '所选文字所在的段落已不在当前稿件中；请重新选择。',
      preparing: '正在为任务保存修订版…',
      prepared: '任务计划已准备；可在任务计划里开始任务。',
      cancelled: '任务准备已取消；稿件保持不变。',
      failed: '无法准备这项任务。',
    });
  });
});

describe('what a selection can start', () => {
  it('offers 重新分析这段 with its fixed goal, then 审阅这段 in each category that can read a selection, in configuration order', () => {
    const offer = selectionTaskChoices(
      analysis({ available: true, unavailableReason: null }),
      workspace([
        category('typos-and-usage', '错别字与规范用语', true, true),
        category('factual-review', '事实核查', true, false),
        category('plot-consistency', '情节逻辑与前后一致', true, true),
        category('cross-deliverable-consistency', '跨交付物一致性', false, true),
      ]),
    );
    expect(offer).toEqual({
      choices: [
        { kind: 'reanalyze', value: 'reanalyze-range', label: '重新分析这段', goal: GOAL },
        { kind: 'review', value: 'review:typos-and-usage', label: '审阅这段 · 「错别字与规范用语」', categoryId: 'typos-and-usage' },
        { kind: 'review', value: 'review:plot-consistency', label: '审阅这段 · 「情节逻辑与前后一致」', categoryId: 'plot-consistency' },
      ],
      refusal: null,
    });
  });

  it('leaves out 重新分析这段 before a first baseline, while a Task runs, and when ②A says it cannot — and 审阅 while one is under way', () => {
    const review = workspace([category('typos-and-usage', '错别字与规范用语', true, true)]);
    expect(selectionTaskChoices(analysis(null), review).choices.map((choice) => choice.value)).toEqual(['review:typos-and-usage']);
    expect(selectionTaskChoices(analysis({ available: true, unavailableReason: null }, '这本书有任务正在运行。'), review).choices.map((choice) => choice.value))
      .toEqual(['review:typos-and-usage']);
    expect(selectionTaskChoices(analysis({ available: false, unavailableReason: '②A 的原因' }), review).choices.map((choice) => choice.value))
      .toEqual(['review:typos-and-usage']);
    const busy = workspace([category('typos-and-usage', '错别字与规范用语', true, true)], { available: false, unavailableReason: '这本书有一次审阅正在进行。' });
    expect(selectionTaskChoices(analysis({ available: true, unavailableReason: null }), busy).choices.map((choice) => choice.value)).toEqual(['reanalyze-range']);
  });

  it('opens nothing when nothing can start, naming each reason in its own words, and offers nothing of a projection it could not read', () => {
    expect(selectionTaskChoices(analysis(null), workspace([category('factual-review', '事实核查', true, false)]))).toEqual({
      choices: [],
      refusal: '就这段现在没有可以发起的工序。重新分析这段要先完成首次基线分析。没有能审阅所选文字的审阅类别。',
    });
    expect(selectionTaskChoices(analysis({ available: true, unavailableReason: null }, '运行中的原因'), workspace([], { available: false, unavailableReason: '审阅中的原因' })))
      .toEqual({ choices: [], refusal: '就这段现在没有可以发起的工序。运行中的原因审阅中的原因' });
    expect(selectionTaskChoices(analysis({ available: false, unavailableReason: null }), null))
      .toEqual({ choices: [], refusal: '就这段现在没有可以发起的工序。重新分析这段要先完成首次基线分析。' });
    expect(selectionTaskChoices(null, null)).toEqual({ choices: [], refusal: '就这段现在没有可以发起的工序。' });
  });
});
