import { describe, expect, it } from 'vitest';
import type { BaselineAnalysisProjection, CapturedProcedureApplicabilityEntryProjection, ReviewWorkspaceProjection } from '../../src/shared/protocol.js';
import {
  SELECTION_JOIN_REFUSED,
  SELECTION_POLISH_HINT,
  SELECTION_POLISH_LABEL,
  SELECTION_POLISH_REASON,
  SELECTION_PROCEDURES_NONE,
  SELECTION_PROCEDURE_NO_VERSION,
  SELECTION_TASK_CHOSEN_APART_LEGEND,
  SELECTION_TASK_DOCUMENT_REASON,
  SELECTION_TASK_FIELD,
  SELECTION_TASK_MENU_LABEL,
  SELECTION_TASK_NOTE,
  SELECTION_TASK_NO_BASELINE,
  SELECTION_TASK_NO_CATEGORY,
  SELECTION_TASK_PREPARE,
  SELECTION_TASK_REANALYZE,
  SELECTION_TASK_STATUS,
  SELECTION_TASK_TITLE,
  selectionProcedureEntries,
  selectionProcedureEntry,
  selectionProcedureHint,
  selectionProcedureLabel,
  selectionProcedureStepReason,
  selectionTaskChoices,
  selectionTaskContextLine,
  selectionTaskGroupNote,
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

const PROCEDURE = '00000000-0000-4000-8000-0000000000aa';
const VERSION = '00000000-0000-4000-8000-0000000000ab';
/** One enabled procedure as `inspectCapturedProcedureApplicability` with `scope: 'selection'` answers it for the Book. */
function procedure(overrides: Partial<CapturedProcedureApplicabilityEntryProjection>): CapturedProcedureApplicabilityEntryProjection {
  return {
    procedureId: PROCEDURE, title: '体例复核', latestEligible: { versionId: VERSION, version: 2 }, fit: 'all', stepCount: 2, availableCount: 2, chosenApart: [], leftOut: [],
    ...overrides,
  };
}

describe('the words of 就这段发起任务…', () => {
  it('names the entry, the composer, its one field, its one action and what it hands over', () => {
    expect(SELECTION_TASK_MENU_LABEL).toBe('就这段发起任务…');
    expect(SELECTION_TASK_TITLE).toBe('就这段发起任务');
    expect(SELECTION_TASK_FIELD).toBe('工序');
    expect(SELECTION_TASK_PREPARE).toBe('准备任务');
    expect(SELECTION_TASK_NOTE).toBe('只把所选文字所在的这一段交给任务：按包含它的阅读范围读取，计划里写明读哪些范围；审阅只在这一段上标出发现。准备任务先打开计划，由你开始；就选区发起的任务没有快速开始。');
    expect(selectionTaskContextLine({ bookTitle: '合成书名', revisionLabel: 'r3', journalSequence: 12, graphemes: 10, position: 7 }))
      .toBe('《合成书名》 · 修订版 r3 · 修订日志序号 12 · 已选 10 字 · 第 7 个内容块');
    expect(SELECTION_TASK_DOCUMENT_REASON).toBe('交付物和制作文档上不能就选区发起任务');
    expect(SELECTION_TASK_REANALYZE).toBe('重新分析这段');
    expect(selectionTaskReviewLabel('错别字与规范用语')).toBe('审阅这段 · 「错别字与规范用语」');
    // The house's 可复用工序 on the selection (S77 deferred item a), the one kept preset, and the refused 再选一段加入.
    expect(selectionProcedureLabel('体例复核')).toBe('按《体例复核》审阅这段');
    expect(selectionProcedureHint(2, 3, [])).toBe('可复用工序 · 第 2 版 · 3 步');
    expect(selectionProcedureHint(1, 2, ['书系一致性'])).toBe('可复用工序 · 第 1 版 · 2 步 · 「书系一致性」另行勾选');
    expect(selectionProcedureStepReason('事实核查', '事实核查暂只能核查全书；就所选文字核查随事实核查的更新方式接入。'))
      .toBe('「事实核查」不能就所选文字运行：事实核查暂只能核查全书；就所选文字核查随事实核查的更新方式接入。');
    expect(SELECTION_PROCEDURE_NO_VERSION).toBe('现在没有可以运行的版本');
    expect(SELECTION_PROCEDURES_NONE).toBe('本社还没有启用的可复用工序。');
    expect([SELECTION_POLISH_LABEL, SELECTION_POLISH_HINT, SELECTION_POLISH_REASON]).toEqual(['润色这段', '常用工序 · 生成修改建议', '润色这段尚未接通：要有一项生成修改建议的润色工序']);
    expect(SELECTION_JOIN_REFUSED).toBe('只就这一段发起；不提供「再选一段加入」，合并两段会把范围扩大到没有选中的文字。');
    expect(SELECTION_TASK_CHOSEN_APART_LEGEND).toBe('要另行勾选的类别');
    // The group's note: no procedures yet is said only once the house's are known; the refusal always.
    expect(selectionTaskGroupNote(null)).toBe(SELECTION_JOIN_REFUSED);
    expect(selectionTaskGroupNote([])).toBe(`${SELECTION_PROCEDURES_NONE}${SELECTION_JOIN_REFUSED}`);
    expect(selectionTaskGroupNote([selectionProcedureEntry(procedure({}))])).toBe(SELECTION_JOIN_REFUSED);
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
      readingProcedure: '正在读取所选的可复用工序…',
      procedureUnreadable: '无法读取所选的可复用工序。',
      procedureChanged: '所选的可复用工序在你选择之后有了变化；请重新打开菜单选择。',
      pickCategory: '请至少勾选一个类别：不勾，这项工序就没有可以运行的步骤。',
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

  it('offers each of the house\'s 可复用工序 that can run on the selection after the categories, and names why one cannot (S77 deferred item a)', () => {
    const entries = selectionProcedureEntries({ procedures: [
      procedure({}),
      procedure({ procedureId: 'p2', title: '书系复核', latestEligible: { versionId: 'v2', version: 1 }, stepCount: 1, availableCount: 1, chosenApart: ['书系一致性'] }),
      procedure({ procedureId: 'p3', title: '含事实核查', fit: 'partial', availableCount: 1, leftOut: [{ label: '事实核查', reason: '事实核查暂只能核查全书；就所选文字核查随事实核查的更新方式接入。' }] }),
      procedure({ procedureId: 'p4', title: '不再可用', latestEligible: null, fit: 'no-version', stepCount: 0, availableCount: 0 }),
    ] });
    expect(entries).toEqual([
      { kind: 'procedure', value: `procedure:${PROCEDURE}`, procedureId: PROCEDURE, title: '体例复核', versionId: VERSION, version: 2, label: '按《体例复核》审阅这段', hint: '可复用工序 · 第 2 版 · 2 步', chosenApart: [], disabledReason: null },
      { kind: 'procedure', value: 'procedure:p2', procedureId: 'p2', title: '书系复核', versionId: 'v2', version: 1, label: '按《书系复核》审阅这段', hint: '可复用工序 · 第 1 版 · 1 步 · 「书系一致性」另行勾选', chosenApart: ['书系一致性'], disabledReason: null },
      // A version with a step that cannot run on the selection is offered disabled, the step named (the Commander's ruling 2).
      { kind: 'procedure', value: 'procedure:p3', procedureId: 'p3', title: '含事实核查', versionId: VERSION, version: 2, label: '按《含事实核查》审阅这段', hint: '可复用工序 · 第 2 版 · 2 步', chosenApart: [],
        disabledReason: '「事实核查」不能就所选文字运行：事实核查暂只能核查全书；就所选文字核查随事实核查的更新方式接入。' },
      { kind: 'procedure', value: 'procedure:p4', procedureId: 'p4', title: '不再可用', versionId: null, version: null, label: '按《不再可用》审阅这段', hint: null, chosenApart: [], disabledReason: '《不再可用》现在没有可以运行的版本' },
    ]);
    expect(selectionProcedureEntries(null)).toEqual([]);
    expect(selectionProcedureEntry(procedure({}))).toEqual(entries[0]);
    // The composer offers only those that can start, after 重新分析这段 and the categories; a 审阅 under way holds them back with the categories.
    const review = workspace([category('typos-and-usage', '错别字与规范用语', true, true)]);
    expect(selectionTaskChoices(analysis(null), review, entries).choices.map((choice) => choice.value)).toEqual(['review:typos-and-usage', `procedure:${PROCEDURE}`, 'procedure:p2']);
    const busy = workspace([category('typos-and-usage', '错别字与规范用语', true, true)], { available: false, unavailableReason: '这本书有一次审阅正在进行。' });
    expect(selectionTaskChoices(analysis(null), busy, entries)).toEqual({ choices: [], refusal: '就这段现在没有可以发起的工序。重新分析这段要先完成首次基线分析。这本书有一次审阅正在进行。' });
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
