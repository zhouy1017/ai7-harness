import type { BaselineAnalysisGoal, BaselineAnalysisProjection, ReviewWorkspaceProjection } from '../shared/protocol.js';

/**
 * 就这段发起任务… (Issue #423, plan slice S77b; editor-surfaces §1 右键菜单 and 任务面, V2-UX-TASK-001, TASK-003, TASK-046): the
 * selection menu's way to start a Task on the selected words. The composer opens anchored to the paragraph, holding only that
 * paragraph, and offers the Tasks that already read a range — 重新分析这段, and 审阅这段 in one category — never a free-text
 * planner, which does not exist. 准备任务 prepares the Task and opens its plan beside the manuscript; nothing starts without it.
 * Pure, so the unit suite pins every string byte for byte and every choice the projections give.
 */

export const SELECTION_TASK_MENU_LABEL = '就这段发起任务…';
export const SELECTION_TASK_TITLE = '就这段发起任务';
export const SELECTION_TASK_FIELD = '工序';
export const SELECTION_TASK_PREPARE = '准备任务';
/**
 * What the Task is given, said before anything is prepared (TASK-002, TASK-003): the paragraph and nothing around it, read the
 * way every range Task reads it, with the plan seen before the start and no quick start.
 */
export const SELECTION_TASK_NOTE = '只把所选文字所在的这一段交给任务：按包含它的阅读范围读取，计划里写明读哪些范围；审阅只在这一段上标出发现。准备任务先打开计划，由你开始；就选区发起的任务没有快速开始。';
/**
 * The exact context the composer carries (TASK-002; Issue #423 review, P3-6): the Book, the revision and journal position the
 * manuscript stands at — 准备任务 saves the Task's own revision from it — how much is selected, and which paragraph it is in.
 */
export function selectionTaskContextLine(context: {
  readonly bookTitle: string;
  readonly revisionLabel: string;
  readonly journalSequence: number;
  readonly graphemes: number;
  readonly position: number;
}): string {
  return `《${context.bookTitle}》 · 修订版 ${context.revisionLabel} · 修订日志序号 ${context.journalSequence} · 已选 ${context.graphemes} 字 · 第 ${context.position} 个内容块`;
}

export const SELECTION_TASK_REANALYZE = '重新分析这段';
export function selectionTaskReviewLabel(category: string): string {
  return `审阅这段 · 「${category}」`;
}

/** The house's 常用工序 do not run on a selection yet: a captured procedure is set for the whole Book or chosen chapters. */
export const SELECTION_PRESET_REASON = '本社常用工序就选区运行尚未接通';
/**
 * A Production Document's manuscript (Issue #423 review, P3-5): no Task reads a document yet, so neither selection Task is
 * offered there. TASK-001 names Editorial Deliverables as a composer host too — an Owner question recorded on the PR.
 */
export const SELECTION_TASK_DOCUMENT_REASON = '交付物和制作文档上不能就选区发起任务';

export const SELECTION_TASK_STATUS = {
  reading: '正在读取可以就这段发起的工序…',
  unreadable: '无法读取可以就这段发起的工序。',
  choose: '选一项工序；准备任务会先打开它的计划。',
  pickFirst: '请先选择一项工序。',
  gone: '所选文字所在的段落已不在当前稿件中；请重新选择。',
  preparing: '正在为任务保存修订版…',
  prepared: '任务计划已准备；可在任务计划里开始任务。',
  cancelled: '任务准备已取消；稿件保持不变。',
  failed: '无法准备这项任务。',
} as const;

/** Why nothing can be started on a selection now, each Task's own reason after the plain fact. */
export function selectionTaskNoneLine(reasons: ReadonlyArray<string>): string {
  return ['就这段现在没有可以发起的工序。', ...reasons].join('');
}
export const SELECTION_TASK_NO_BASELINE = '重新分析这段要先完成首次基线分析。';
export const SELECTION_TASK_NO_CATEGORY = '没有能审阅所选文字的审阅类别。';

/** One Task the composer offers on a selection. */
export type SelectionTaskChoice =
  | { readonly kind: 'reanalyze'; readonly value: 'reanalyze-range'; readonly label: string; readonly goal: BaselineAnalysisGoal }
  | { readonly kind: 'review'; readonly value: string; readonly label: string; readonly categoryId: string };

export interface SelectionTaskChoices {
  readonly choices: ReadonlyArray<SelectionTaskChoice>;
  /** Why the composer does not open — every Task's reason — when it offers nothing; `null` otherwise. */
  readonly refusal: string | null;
}

/**
 * What a selection can start now (TASK-001, TASK-046): 重新分析这段 while the Book's analysis has a revision to update and no
 * Task of it runs, and 审阅这段 in each category that can read a selection while no 审阅 of the Book is under way. A projection
 * that could not be read offers nothing of its kind.
 */
export function selectionTaskChoices(
  analysis: Pick<BaselineAnalysisProjection, 'updateControls'> | null,
  workspace: Pick<ReviewWorkspaceProjection, 'categories' | 'newReview'> | null,
): SelectionTaskChoices {
  const choices: SelectionTaskChoice[] = [];
  const reasons: string[] = [];
  const controls = analysis?.updateControls ?? null;
  if (analysis !== null) {
    const action = controls?.actions['reanalyze-range'] ?? null;
    if (controls === null || action === null) reasons.push(SELECTION_TASK_NO_BASELINE);
    else if (controls.blockedByActiveRun) reasons.push(controls.blockedReason ?? action.unavailableReason ?? SELECTION_TASK_NO_BASELINE);
    else if (!action.available) reasons.push(action.unavailableReason ?? SELECTION_TASK_NO_BASELINE);
    else choices.push({ kind: 'reanalyze', value: 'reanalyze-range', label: SELECTION_TASK_REANALYZE, goal: action.goal as BaselineAnalysisGoal });
  }
  if (workspace !== null) {
    if (!workspace.newReview.available) {
      reasons.push(workspace.newReview.unavailableReason ?? SELECTION_TASK_NO_CATEGORY);
    } else {
      const reviewable = workspace.categories.filter((category) => category.available && category.scopes.selection.available);
      if (reviewable.length === 0) reasons.push(SELECTION_TASK_NO_CATEGORY);
      for (const category of reviewable) {
        choices.push({ kind: 'review', value: `review:${category.categoryId}`, label: selectionTaskReviewLabel(category.label), categoryId: category.categoryId });
      }
    }
  }
  return { choices, refusal: choices.length > 0 ? null : selectionTaskNoneLine(reasons) };
}
