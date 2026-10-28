import type {
  AnalysisGapProjection,
  BaselineAnalysisResultSetRevisionProjection,
  BookTaskGroupKey,
  BookTaskItemProjection,
  ReviewFindingProjection,
} from '../shared/protocol.js';
import {
  GLOBAL_ATTENTION_NEXT_STEP_LABELS,
  GLOBAL_ATTENTION_STATE_LABELS,
  GLOBAL_ATTENTION_STATE_PILLS,
  globalAttentionObjectLabel,
  globalAttentionReason,
  globalAttentionTimeLine,
} from './global-attention-labels.js';
import type { ReviewPill } from './review-labels.js';
import { TASK_PLAN_OPEN } from './task-drawer-labels.js';
import { DIALOGUE_ANSWER_LABEL } from './dialogue-labels.js';

/**
 * The words of the 任务 panel (Issue #423, plan slice S77a; editor-surfaces §1 任务面, V2-UX-TASK-044, TASK-045): the
 * Book's Tasks in three groups, each a card of its content and state with the actions its state offers, a finished
 * Task's result in a floating window beside the text, and the 回到<位置> chip a jump leaves. A Task's state, reason and
 * next step are 待我处理's own words for it, so the two never say different things. Pure, so the unit suite pins every
 * string byte for byte.
 */

// ---- the panel ------------------------------------------------------------------------------------------

export const TASK_PANEL_TITLE = '任务';
export function taskPanelScopeLine(total: number): string {
  return `这本书 · ${total} 项`;
}
/** The panel lists only this Book's Tasks (TASK-044); what waits across Books is 待我处理's. */
export const TASK_PANEL_NOTE = '这里只列这本书的任务；跨书的待办在「待我处理」。';
export const TASK_PANEL_GROUP_LABELS: Readonly<Record<BookTaskGroupKey, string>> = {
  waiting: '等你处理',
  running: '进行中',
  recent: '最近完成',
};
export const TASK_PANEL_EMPTY_LINES: Readonly<Record<BookTaskGroupKey, string>> = {
  waiting: '没有等你处理的任务。',
  running: '没有进行中的任务。',
  recent: '还没有完成的任务。',
};
/** A group longer than one answer lists says how many it holds. */
export function taskPanelMoreLine(group: BookTaskGroupKey, shown: number, total: number): string | null {
  if (total <= shown) return null;
  return group === 'recent' ? `只列出最近的 ${shown} 项。` : `共 ${total} 项，这里列出 ${shown} 项。`;
}
export const TASK_PANEL_STATUS_LINES = {
  loading: '正在读取这本书的任务…',
  unavailable: '无法读取这本书的任务。',
} as const;

// ---- one card ---------------------------------------------------------------------------------------------

/** What kind of Task a card is (TASK-044): a dialogue Task (Issue #52, S17a), or one that runs without a dialogue. */
export const TASK_PANEL_KIND_LABELS = {
  analysis: '分析任务 · 不需要对话',
  review: '审阅任务 · 不需要对话',
  // A ledger Task of another kind (Issue #760, S74c): 评估's three, and the 写作任务.
  evaluation: '评估任务 · 不需要对话',
  writing: '写作任务 · 不需要对话',
  dialogue: '对话任务 · 就所选文字提问',
} as const;

export const TASK_PANEL_ACTION_LABELS = {
  pause: '暂停',
  resume: '续行',
  cancel: '停止任务',
  plan: TASK_PLAN_OPEN,
  result: '查看结果',
  // A dialogue Task's own two (TASK-044): its latest answer in the floating window, and the dialogue in the foreground.
  answer: DIALOGUE_ANSWER_LABEL,
  // A selection Task's own (Issue #423, S77 deferred item d): the caret moved to the paragraph it was started on.
  jump: '跳到所选文字',
} as const;
/** 跳到所选文字 when the paragraph the Task was started on no longer stands in the manuscript: said, nothing moves. */
export const TASK_PANEL_JUMP_GONE = '所选文字所在的段落已不在当前稿件中，无法跳到。';

/**
 * What a card offers. `pause` and `resume` act on the card, as the drawer's bar does; `cancel` opens the plan with its
 * Cancellation Impact Summary, where the cancellation is confirmed; `plan` and `next` open the plan or the Task's own
 * surface; `result` opens `查看结果`'s floating window; `jump` moves the caret to a selection Task's paragraph.
 */
export type TaskPanelActionKey = 'pause' | 'resume' | 'cancel' | 'plan' | 'next' | 'result' | 'answer' | 'jump';
export interface TaskPanelAction {
  readonly key: TaskPanelActionKey;
  readonly label: string;
  readonly primary: boolean;
}

export interface TaskPanelCardView {
  readonly kindLabel: string;
  readonly title: string;
  readonly stateLabel: string;
  readonly pill: ReviewPill;
  readonly reason: string;
  readonly timeLine: string;
  readonly actions: ReadonlyArray<TaskPanelAction>;
}

const action = (key: TaskPanelActionKey, primary = false): TaskPanelAction => ({
  key,
  label: key === 'next' ? '' : TASK_PANEL_ACTION_LABELS[key],
  primary,
});

/**
 * One Task as a card (TASK-044): its kind, what it is, its state in 待我处理's words with the pill's shape, why it is
 * where it is, when, and what it offers. A Run in flight offers 暂停 while it reads and 取消任务; a stopped one 续行 and
 * 取消任务; a finished one 查看结果 when it formed a result; everything else its own next step, as 待我处理 names it.
 */
export function taskPanelCardView(entry: BookTaskItemProjection): TaskPanelCardView {
  const { item } = entry;
  const next: TaskPanelAction = { key: 'next', label: GLOBAL_ATTENTION_NEXT_STEP_LABELS[item.nextStep], primary: true };
  let actions: TaskPanelAction[];
  switch (item.state) {
    case 'analysis-running':
      actions = [action('pause', true), action('cancel'), action('plan')];
      break;
    case 'analysis-waiting-idle':
    case 'analysis-yielded':
    case 'analysis-queued':
    case 'analysis-pausing':
      actions = [action('cancel'), action('plan')];
      break;
    case 'analysis-paused':
    case 'analysis-resumable':
      actions = [action('resume', true), action('cancel'), action('plan')];
      break;
    // A dialogue Task offers 回答 and 打开对话 (TASK-044); 回答 once its latest answer settled with something to read.
    case 'dialogue-answering':
    case 'dialogue-answered':
    case 'dialogue-stopped':
    case 'dialogue-interrupted':
    case 'dialogue-failed':
      actions = [...(entry.result !== null ? [action('answer')] : []), next];
      break;
    case 'analysis-cancelling':
    case 'analysis-waiting-capacity':
    case 'analysis-waiting-network':
    case 'analysis-waiting-connection':
    case 'analysis-waiting-slot':
    case 'analysis-waiting-admission':
      actions = [action('plan', true)];
      break;
    default:
      actions = item.group === 'recent' && entry.result !== null ? [action('result', true)] : [next];
  }
  // A Task started on a selection offers the way to its paragraph in every state (Issue #423, S77 deferred item d).
  if (entry.selection !== undefined) actions = [...actions, action('jump')];
  return {
    kindLabel: item.object.kind === 'review' ? TASK_PANEL_KIND_LABELS.review
      : item.object.kind === 'draft' ? TASK_PANEL_DRAFT_KIND
      : item.object.kind === 'dialogue' ? TASK_PANEL_KIND_LABELS.dialogue
        : item.object.kind === 'task' ? (item.object.taskKind === 'writing' ? TASK_PANEL_KIND_LABELS.writing : TASK_PANEL_KIND_LABELS.evaluation)
          : TASK_PANEL_KIND_LABELS.analysis,
    title: globalAttentionObjectLabel(item.object),
    stateLabel: GLOBAL_ATTENTION_STATE_LABELS[item.state],
    pill: GLOBAL_ATTENTION_STATE_PILLS[item.state],
    reason: globalAttentionReason(item),
    timeLine: globalAttentionTimeLine(item.group, item.at),
    actions,
  };
}

// ---- 发起全书任务 -----------------------------------------------------------------------------------------

export const TASK_PANEL_COMPOSE_HEADING = '发起全书任务';
export const TASK_PANEL_COMPOSE_LEDE = '在这本书上发起一项全书工序。准备任务先看计划再开始；快速开始按你设的默认执行规则直接开始。';
export const TASK_PANEL_COMPOSE_FIELD = '全书工序';
export const TASK_PANEL_COMPOSE_ACTIONS = { quick: '快速开始', prepare: '准备任务' } as const;
export const TASK_PANEL_COMPOSE_NONE = '这本书现在没有可以发起的全书工序。';
/** The first baseline, before the Book has one: the one whole-Book procedure it can start. */
export const TASK_PANEL_COMPOSE_FIRST = { label: '首次基线分析', meaning: '梳理全书的人物、事件、关系与设定，作为其他任务的底稿。' } as const;
/** No 默认执行规则 is ever set for the first baseline (Issue #421): it starts from its plan. */
export const TASK_PANEL_COMPOSE_FIRST_QUICK = '首次基线分析没有快速开始：先看计划再开始。';
/**
 * A card's or 查看结果's way to another page, and 发起全书任务, while the manuscript is on screen (Issue #423 review): its local
 * edits are settled first, as its own ways out do, and a refusal keeps it there.
 */
export const TASK_PANEL_LEAVE_STATUS = {
  settling: '正在保存当前编辑…',
  stayed: '当前页面还有保存或写入没有完成；完成后再继续。',
} as const;

export const TASK_PANEL_COMPOSE_STATUS = {
  preparing: '正在为任务保存修订版…',
  prepared: '任务计划已准备；可在任务计划里开始任务。',
  cancelled: '任务准备已取消；稿件与任务草稿保持不变。',
  failed: '无法准备这项任务。',
} as const;

// ---- 查看结果: the floating window beside the text (TASK-045) --------------------------------------------------

export const TASK_RESULT_KIND = '任务结果';
export const TASK_RESULT_CLOSE = '关闭';
export const TASK_RESULT_LOADING = '正在读取这项任务的结果…';
export const TASK_RESULT_UNAVAILABLE = '无法读取这项任务的结果。';
export const TASK_RESULT_ROWS = { task: '任务', read: '读取了', notDone: '没有做' } as const;
export const TASK_RESULT_JUMP = '跳到';
export const TASK_RESULT_OPEN = { analysis: '在分析中打开', review: '在审阅中打开' } as const;
/** The window leaves the reading position where it is; a jump leaves the way back (TASK-045). */
export const TASK_RESULT_FOOT_NOTE = '浮窗不改变你在稿件中的位置；跳过去后，稿件顶部会有「回到…」，一键回来。';
export const TASK_RESULT_COLUMNS = {
  analysis: ['#', '阅读范围', '结果', '位置'],
  review: ['#', '类别', '发现', '位置'],
} as const;

/** 任务: what it was and when it finished. */
export function taskResultTaskLine(entry: BookTaskItemProjection): string {
  return `${globalAttentionObjectLabel(entry.item.object)} · ${globalAttentionTimeLine(entry.item.group, entry.item.at)}`;
}

/** An analysis read the whole manuscript as it stood at the revision it pins. */
export function analysisResultReadLine(revision: { units: ReadonlyArray<{ unitOrdinal: number }>; manuscriptPin: BaselineAnalysisResultSetRevisionProjection['manuscriptPin']; unitPage?: { total: number } }): string {
  return `全书 ${revision.unitPage?.total ?? revision.units.length} 个阅读范围 · 稿件修订版 ${revision.manuscriptPin.revisionLabel}`;
}
export const ANALYSIS_RESULT_NOT_DONE = '没有修改稿件：分析只读稿件。';

/** A 审阅 read the categories it names; its findings are marks on the manuscript, which it never changed. */
export function reviewResultReadLine(categories: ReadonlyArray<string>): string {
  return categories.length === 0 ? '审阅类别' : `审阅类别：${categories.map((label) => `「${label}」`).join('')}`;
}
export const REVIEW_RESULT_NOT_DONE = '没有修改稿件：发现作为标记放在稿件上，由你处理。';

/** A reading range, by the heading the manuscript gives it when it has one. */
export function taskResultRangeTitle(unitOrdinal: number, heading: string | null): string {
  return heading === null ? `第 ${unitOrdinal} 个阅读范围` : `第 ${unitOrdinal} 个阅读范围 · 「${heading}」`;
}

/** What the analysis made of one range: read, or not read and why (ANALYSIS-004). */
export function analysisResultUnitLine(gap: Pick<AnalysisGapProjection, 'reason'> | null): string {
  return gap === null ? '已分析' : `尚未分析：${gap.reason}`;
}

/** One finding of a 审阅: its words, cut short at a line. */
export function reviewResultFindingLine(finding: Pick<ReviewFindingProjection, 'quote' | 'note'>): string {
  const words = finding.note.trim().length > 0 ? finding.note.trim() : `「${finding.quote}」`;
  return [...words].length > 60 ? `${[...words].slice(0, 60).join('')}…` : words;
}

/** Where a finding stands: its chapter, or the manuscript when it falls in none. */
export function reviewResultPlaceLine(finding: Pick<ReviewFindingProjection, 'chapterTitle' | 'blockPosition'>): string {
  if (finding.chapterTitle !== null) return finding.chapterTitle;
  return finding.blockPosition === null ? '已不在当前稿件中' : `第 ${finding.blockPosition} 个内容块`;
}

export function reviewResultMoreLine(shown: number, total: number): string | null {
  return total > shown ? `共 ${total} 条发现，这里列出前 ${shown} 条；全部在审阅中。` : null;
}
export const REVIEW_RESULT_NONE = '这次审阅没有发现。';

// ---- 回到<位置>: the way back a jump leaves (TASK-045) --------------------------------------------------------

/** The most characters of a heading the chip names before it is cut short. */
export const RETURN_CHIP_PLACE_CHARACTERS = 16;
/** The place the chip names: the heading the editor was reading under, or the paragraph's number when there is none. */
export function returnChipPlace(heading: string | null, position: number): string {
  if (heading === null || heading.trim().length === 0) return `第 ${position} 个内容块`;
  const words = [...heading.trim()];
  return words.length > RETURN_CHIP_PLACE_CHARACTERS ? `${words.slice(0, RETURN_CHIP_PLACE_CHARACTERS).join('')}…` : words.join('');
}
export function returnChipLabel(place: string): string {
  return `回到${place}`;
}
export const RETURN_CHIP_TITLE = '回到跳转前的位置';
export function returnChipArrived(place: string): string {
  return `已回到${place}。`;
}

// ---- The Context-bound Task Composer and Task Intent Drafts (Issue #423, wave 10 slice 7a; TASK-001 to 009, 042, 043, 046) --

/** A draft's card in 等你处理 (TASK-004): no Task yet, nothing started by itself. */
export const TASK_PANEL_DRAFT_KIND = '任务草稿 · 尚未成为任务';
/** 发起全书任务's own way to the composer (TASK-001): the editor says what AI7 should do; the procedures below stay for 快速开始. */
export const TASK_PANEL_COMPOSE_OPEN = '发起全书任务…';
export const TASK_PANEL_COMPOSE_OPEN_NOTE = '用自己的话说明要做的编辑工作，先存为任务草稿；下面的全书工序可以直接准备或快速开始。';

export const TASK_COMPOSER_TITLES = {
  selection: '就这段发起任务',
  book: '发起全书任务',
  draft: '任务意图草稿',
} as const;
/** The composer's one field, in editorial words (TASK-001): never a chat box. */
export const TASK_COMPOSER_GOAL_LABEL = '描述希望 AI7 完成的编辑工作';
export const TASK_COMPOSER_GOAL_PLACEHOLDER = '例如：统一全书人名的译法，列出前后不一致的地方';
export function taskComposerGoalCount(length: number, max: number): string {
  return `${length} / ${max} 字`;
}
export const TASK_COMPOSER_OUTCOME_LEGEND = '希望得到的结果';
export const TASK_COMPOSER_OUTCOME_LABELS = {
  analysis: '稿件分析',
  review: '审阅（在稿件上标出发现）',
  factual: '事实核查',
  writing: '写作任务（起草一份文档）',
} as const;
export const TASK_COMPOSER_TARGET_LEGEND = '要处理什么';
export const TASK_COMPOSER_TARGET_LABELS = {
  ranges: '只处理所选文字',
  book: '全书稿件',
} as const;
/** A whole-Book target names the manuscript, never its access (TASK-007): what is read is set by the plan. */
export const TASK_COMPOSER_BOOK_TARGET_NOTE = '全书稿件：准备计划时，计划会写明读取哪些范围、发送什么；在那之前不读取、不发送。';
export const TASK_COMPOSER_CONTEXT_HEADING = '这项任务带着';
export function taskComposerBookLine(bookTitle: string): string {
  return `《${bookTitle}》 · 稿件`;
}
/** The branch and revision the composer was opened on (TASK-002); `待保存修订版` while edits are newer than it. */
export function taskComposerRevisionLine(revisionLabel: string, journalSequence: number, pending: boolean): string {
  return `修订版 ${revisionLabel} · 修订日志序号 ${journalSequence}${pending ? ' · 待保存修订版' : ''}`;
}
export const TASK_COMPOSER_NO_RANGES = '没有带所选文字。';
/** Words pinned while the journal holds edits no revision holds yet (TASK-002, 031). */
export const TASK_COMPOSER_PENDING_LABEL = '待保存修订版';
/** Where a range lies: one block, or a span's contiguous blocks (Issue #1176), counted without the breaks between them. */
export function taskComposerRangeLine(position: number | null, graphemes: number, revisionLabel: string, paragraphs = 1): string {
  const place = position === null ? '段落已不在当前稿件中' : paragraphs > 1 ? `第 ${position}–${position + paragraphs - 1} 个内容块 · ${paragraphs} 段` : `第 ${position} 个内容块`;
  return `${place} · ${graphemes - (paragraphs - 1)} 字 · 修订版 ${revisionLabel}`;
}
export const TASK_COMPOSER_RANGE_REMOVE = '移除';
/** 再选一段加入 lives here, never in the selection menu (TASK-046). */
export const TASK_COMPOSER_ADD_RANGE = '再选一段加入';
export const TASK_COMPOSER_ADD_RANGE_NONE = '先在稿件里选中要加入的文字，再按「再选一段加入」。';
export const TASK_COMPOSER_ADD_RANGE_SAME = '这段文字已经在草稿里。';
export function taskComposerAddRangeLimit(max: number): string {
  return `一份草稿最多带 ${max} 段所选文字。`;
}
/** The house's existing 工序 on the one selected paragraph: the composer that prepares one at once. */
export const TASK_COMPOSER_PROCEDURES = '按现成工序准备…';
export const TASK_COMPOSER_ACTIONS = {
  prepare: '准备任务',
  save: '保存修改',
  promote: '准备计划',
  close: '收起',
  cancel: '取消',
  copy: '另起一份草稿',
  clearPin: '移除',
  resume: '返回继续',
} as const;
/** What 准备任务 does (TASK-004): a durable draft, and nothing else. */
export const TASK_COMPOSER_NOTE = '准备任务只把这些存为任务草稿：不调用模型、不发送任何内容，也不会开始任务；准备计划后它才成为任务，由你开始。';
export function taskComposerDraftHeading(ordinal: number): string {
  return `任务意图草稿 · 第 ${ordinal} 版`;
}
export const TASK_COMPOSER_UNSAVED = '有未保存的修改。';
export const TASK_COMPOSER_PROMOTE_SAVE_FIRST = '先保存修改，再准备计划。';
export const TASK_COMPOSER_RESOLUTION_HEADING = '准备成什么任务';
export function taskComposerResolutionReady(label: string): string {
  return `准备计划会按「${label}」准备一项任务；由你在计划里开始。`;
}
export const TASK_COMPOSER_RESOLUTION_CHOOSE = '有几种任务都合适，选一种：';
export const TASK_COMPOSER_WRITING_AUDIENCE = '受众';
export const TASK_COMPOSER_WRITING_CHANNEL = '渠道';
export const TASK_COMPOSER_PICK_CHOICE = '请先选一种任务。';
export const TASK_COMPOSER_WRITING_FIELDS = '请写下这份文档的受众和渠道。';
/** A promoted draft is final: its Task is a normal prepared Task (AUTH-002). */
export const TASK_COMPOSER_PROMOTED = '这份草稿已准备成任务：在任务计划里查看并开始。要改要求，请另起一份草稿。';
export const TASK_COMPOSER_OPEN_PLAN = '查看计划';
export const TASK_COMPOSER_COPY_RANGES_DROPPED = '另起的草稿不带原来的所选文字；需要时请在稿件里重新选择后「再选一段加入」。';
/** A draft made from a dialogue answer (DIALOG-016): generated content, with where it came from. */
export function taskComposerAnswerHeading(ordinal: number): string {
  return `来自对话回答 · 第 ${ordinal} 次`;
}
export const TASK_COMPOSER_ANSWER_NOTE = '回答是生成的内容，只供参考，不是事实结论；它随草稿保存，不会发送。';
export const TASK_COMPOSER_ANSWER_TRUNCATED = '回答较长，这里只保留了前面完整的句子。';
export function taskComposerPinLine(title: string | null): string {
  return title === null ? '已选工序' : `已选工序：《${title}》`;
}
/** Switching Books (TASK-006): the unfinished draft stays with its Book, collapsed, with the way back. */
export function taskComposerParkedLine(bookTitle: string): string {
  return `《${bookTitle}》有一份没有完成的任务草稿，留在那本书里。`;
}
export const TASK_COMPOSER_STATUS = {
  saving: '正在保存任务草稿…',
  saved: '已存为任务草稿：准备计划后它才成为任务。',
  updated: '已保存修改，成为草稿的新版本。',
  saveFailed: '无法保存任务草稿。',
  reading: '正在读取任务草稿…',
  unreadable: '无法读取这份任务草稿。',
  preparing: '正在为任务保存修订版并准备计划…',
  prepared: '任务计划已准备；可在任务计划里开始任务。',
  promoteFailed: '无法准备计划；草稿保持不变。',
  cancelled: '准备计划已取消；草稿保持不变。',
  goalEmpty: '请描述希望 AI7 完成的编辑工作。',
  composing: '输入法正在输入，完成后再准备任务。',
} as const;

