import { completedWithGapsLabel } from '../shared/analysis-run-summary.js';
import type { TaskOverviewItemProjection } from '../shared/protocol.js';
import { technicalLayerVisible, technicalWords } from './technical-layer.js';
import {
  BASELINE_ANALYSIS_MODE_LABELS,
  GLOBAL_ATTENTION_COUNTED_GROUPS,
  GLOBAL_ATTENTION_RECENT_DAYS,
  type GlobalAttentionGroupKey,
  type GlobalAttentionItemProjection,
  type GlobalAttentionNextStep,
  type GlobalAttentionObjectProjection,
  type GlobalAttentionProjection,
  type GlobalAttentionStateKey,
} from '../shared/protocol.js';
import { RUN_LIVENESS_STAGE_LABELS, localInstantLabel } from './plan-preview-labels.js';
import type { ReviewPill } from './review-labels.js';
import { REVIEW_ACTION_LABELS } from './review-labels.js';
import { RESUMABLE_STOP_REASON_LABELS, TASK_BAR_RECONFIRM, TASK_BAR_REDO, TASK_BAR_REPREPARE, TASK_BAR_RUN_LINKS, TASK_PLAN_OPEN_START, UNCONFIRMED_TASK_KIND_LABELS, unconfirmedWhat } from './task-drawer-labels.js';
import { RESOLVE_CONFLICT_LABEL } from './editorial-mark-labels.js';
import { PROPOSAL_CONFLICT_CLASSIFICATION } from './proposal-conflict-labels.js';
import { MAINTENANCE_CLASSIFICATION_LABELS, MAINTENANCE_NEXT_STEP_LABELS } from '../shared/maintenance-wording.js';
import { LIBRARY_ATTRIBUTE, LIBRARY_ELIGIBILITY, LIBRARY_HOUSE, LIBRARY_KIND_LABELS, LIBRARY_NO_ATTRIBUTION, materialIndexCompletedReason } from './knowledge-base-labels.js';
import { DIALOGUE_CARD_REASONS, DIALOGUE_OPEN_LABEL, DIALOGUE_STATE_LABELS, DIALOGUE_WAITING_LABEL, dialogueQuestionLine } from './dialogue-labels.js';

/**
 * Every word of 待我处理 (Issue #424, plan slice S78; editor-surfaces §8.1, V2-UX-ATTN-001 to 009, IA-007,
 * IA-013) and the one view model the screen draws: the entry's number, the four group headings in their
 * fixed order, each item's Book, object, exact state or decision, reason and safe next step, and the lines a
 * group shows when it is empty or longer than one answer. The projection carries keys and record facts; the
 * words are all here, pure, so the unit suite pins each one without a DOM.
 *
 * Nothing here decides anything: an item's next step is a statement of what its own record offers, in the
 * words that record already uses, and the view never says 待审批 or 批准 (interaction-spec › Ordering and
 * naming), and no control of it carries 授权.
 */

// ---- the entry in the shell's header (IA-007) -------------------------------------------------------

export const GLOBAL_ATTENTION_ENTRY_LABEL = '待我处理';

/**
 * What the entry shows: its name, and — only while the first two groups hold anything — the Actionable
 * Attention Count as a number in a badge whose outline is its shape (V2-UX-ATTN-006, editor-surfaces §0.3).
 * The accessible name says the number in words, so the badge never speaks by colour or by position alone.
 */
export function globalAttentionEntryView(count: number | null): { text: string; badge: string | null; accessibleName: string } {
  if (count === null || count <= 0) return { text: GLOBAL_ATTENTION_ENTRY_LABEL, badge: null, accessibleName: GLOBAL_ATTENTION_ENTRY_LABEL };
  return { text: GLOBAL_ATTENTION_ENTRY_LABEL, badge: String(count), accessibleName: `${GLOBAL_ATTENTION_ENTRY_LABEL}，${count} 项需要你处理` };
}

// ---- the screen -----------------------------------------------------------------------------------------

export const GLOBAL_ATTENTION_SECTION_LABEL = '全局 · 待我处理';
export const GLOBAL_ATTENTION_HEADING = '待我处理';
export const GLOBAL_ATTENTION_LEDE = '所有图书里需要你处理的事项。点开一项回到它自己的记录，在那里决定；这里只列出，不替你做任何决定。';
/** IA-013: a Book's own findings stay in that Book's 发现; this view keeps only what crosses Books. */
export const GLOBAL_ATTENTION_FINDINGS_NOTE = '书内的发现在那本书的「发现」里。';
export const GLOBAL_ATTENTION_ACTIONS = ['返回图书列表'] as const;

export const GLOBAL_ATTENTION_STATUS_LINES = {
  loading: '正在读取待我处理…',
  opened: '待我处理已打开',
  refreshFailed: '无法刷新待我处理。',
  unavailable: '无法读取待我处理。',
  opening: '正在打开这一项的记录…',
  openFailed: '无法打开这一项的记录。',
  leaving: '正在保存并打开待我处理…',
  /** The page on screen kept the window: a save or a write of its own is not finished. */
  stayed: '当前页面还有保存或写入没有完成；完成后再打开待我处理。',
} as const;

/** V2-UX-ATTN-001: the four groups, in their one fixed order. */
export const GLOBAL_ATTENTION_GROUP_LABELS: Readonly<Record<GlobalAttentionGroupKey, string>> = {
  exceptions: '异常与结果待确认',
  decisions: '等待你的决定',
  active: '运行中与已暂停',
  recent: '最近完成',
};

/** An empty group keeps its heading and says so quietly. */
export const GLOBAL_ATTENTION_EMPTY_LINES: Readonly<Record<GlobalAttentionGroupKey, string>> = {
  exceptions: '没有异常或待确认的结果。',
  decisions: '没有等待你的决定。',
  active: '没有正在运行或中途停止的任务。',
  recent: `最近 ${GLOBAL_ATTENTION_RECENT_DAYS} 天没有完成的任务。`,
};

/** Whether the group's items count toward the entry's number (V2-UX-ATTN-006). */
export function globalAttentionGroupCounts(group: GlobalAttentionGroupKey): boolean {
  return GLOBAL_ATTENTION_COUNTED_GROUPS.includes(group);
}

/** The heading's count: a counted group says its items need the editor; the others only how many there are. */
export function globalAttentionGroupCountLine(group: GlobalAttentionGroupKey, total: number): string {
  if (total === 0) return '';
  return globalAttentionGroupCounts(group) ? `${total} 项需要你处理` : `${total} 项`;
}

/** A group longer than one answer names how many it holds and which of them are listed. */
export function globalAttentionTruncatedLine(group: GlobalAttentionGroupKey, shown: number, total: number): string | null {
  if (total <= shown) return null;
  return `共 ${total} 项，这里列出${group === 'recent' ? '最新' : '最早'}的 ${shown} 项。`;
}

// ---- one item: its state, words and a shape (editor-surfaces §0.3) ---------------------------------------

/**
 * A Task Intent Draft as 待我处理 and the 任务 panel name it (Issue #423, slice 7a; TASK-004 to 006): unfinished until 准备计划
 * makes it a prepared Task, and 继续编辑草稿 opens it beside its own Book's manuscript.
 */
export const TASK_INTENT_DRAFT_STATE_LABEL = '任务草稿 · 尚未准备计划';
export const TASK_INTENT_DRAFT_CONTINUE = '继续编辑草稿';
/** The most characters of a draft's sentence a card names before it is cut short. */
export const TASK_INTENT_DRAFT_TITLE_CHARACTERS = 24;
export function taskIntentDraftTitle(goal: string): string {
  const words = [...goal.trim().replace(/\s+/gu, ' ')];
  return `任务草稿 · 「${words.length > TASK_INTENT_DRAFT_TITLE_CHARACTERS ? `${words.slice(0, TASK_INTENT_DRAFT_TITLE_CHARACTERS).join('')}…` : words.join('')}」`;
}

/** Each item's exact state or named decision, in the words its own record already uses. */
export const GLOBAL_ATTENTION_STATE_LABELS: Readonly<Record<GlobalAttentionStateKey, string>> = {
  'apply-outcome-unresolved': '应用结果待确认',
  'import-outcome-uncertain': '导入提交结果待确认',
  'import-cleanup-pending': '放弃清理尚未完成',
  'recovery-pending': '恢复待确认状态',
  'recovery-deferred': '恢复待确认状态 · 已稍后处理',
  // 稿件冲突's own classification (Issue #57); 暂不处理 records the conflict and leaves it standing (ADR 0085 §3).
  'manuscript-conflict': PROPOSAL_CONFLICT_CLASSIFICATION,
  'manuscript-conflict-deferred': `${PROPOSAL_CONFLICT_CLASSIFICATION} · 暂不处理`,
  'analysis-failed': '运行失败',
  'analysis-interrupted': '已中断',
  // Run Budget Ceiling Reached (Issue #51, S16a): the drawer's own status for it (editor-surfaces §6).
  'analysis-budget-reached': '已停止 · 预算已达上限',
  // A Provider Account Limit (Issue #51, S16b): the drawer's own status, a blocker the editor resolves with the model service.
  'analysis-account-limit': '模型服务账户限额',
  // A Run stopped on sent requests whose results cannot be known (Issue #51, S16c), recorded before #1080: the per-unit state.
  get 'analysis-outcome-unknown'() { return technicalWords('该单元结果未知', '部分任务结果待确认'); },
  // 结果待确认 a completed Run left (Issue #757): the same words; the Task Outcome stands.
  'analysis-outcome-unconfirmed': '结果待确认',
  'analysis-blocked': '派发前已阻止',
  'analysis-orphaned': '已中断',
  'review-failed': '运行失败',
  'review-stopped': '中途停止',
  // V2-UX-ATTN-003: the named decision itself, never a generic 待审批.
  'analysis-plan-revision': '计划修订',
  // A waiting Run whose plan moved before it could start (Issue #536; OFF-008), in the drawer's words for it.
  'analysis-plan-moved': '需要重新确认计划',
  // A Clarification Request (Issue #422, S76d): the bar's own words for it.
  'analysis-clarification': '等你回答',
  'analysis-queued': '正在排队',
  'analysis-running': '运行中',
  // A Run in Connectivity Wait (Issue #502), in the drawer's words for what it waits for: never 运行中, never 已暂停.
  'analysis-waiting-network': '等待网络',
  'analysis-waiting-connection': '需要处理模型连接',
  // Not in the capacity queue (Issue #632): the drawer's own words for it, never 等待运行名额.
  'analysis-waiting-slot': '已联网 · 名额已满',
  // The drawer's own word for it (Issue #539): nothing runs yet.
  'analysis-waiting-admission': '正在排队',
  // A start waiting on the governor for a place (Issue #49, S14; CONC-007), in the drawer's words for it.
  'analysis-waiting-capacity': '等待运行名额',
  'analysis-waiting-idle': '等待空闲',
  'analysis-yielded': '让位给你的任务',
  'analysis-cancelling': '正在取消',
  'analysis-pausing': '正在暂停',
  'analysis-paused': '已暂停',
  'analysis-resumable': '任务已中断 · 可续行',
  'review-running': '运行中',
  // A Review Run a stopped service left mid-way; there is no pause yet, so it is never called 已暂停.
  'review-continuable': '中途停止 · 可继续审阅',
  'analysis-completed': '已完成',
  'analysis-completed-with-gaps': '已完成 · 保留缺口',
  'review-completed': '已完成',
  // The 任务 panel's own three (Issue #423, S77a): a plan nobody started, and a Task the editor cancelled (CTRL-005).
  'analysis-prepared': '计划已准备 · 等你开始',
  'review-prepared': '计划已准备 · 等你开始',
  'analysis-cancelled': '已取消',
  // MAINT-012's own name for it (Issue #426, S68b), and the wait 替代 and 再版 are in.
  'maintenance-pending': '维护事项待处理',
  'maintenance-waiting': '维护事项待处理 · 等待另设发稿版本',
  // A 资料库 item waiting for the editor (Issue #427, S79c; ATTN-009), in the words the material table placed them under.
  'library-attribution-pending': '资料库归属待定',
  get 'learning-eligibility-pending'() { return technicalWords('学习准入待定', '使用范围待定'); },
  get 'learning-eligibility-deferred'() { return technicalWords('学习准入待定 · 稍后决定', '使用范围待定 · 稍后决定'); },
  // A Book's Learning Material (Issue #61, S26b; LEARN-002): the words of the spec's attention item.
  get 'learning-materials-pending'() { return technicalWords('学习准入待处理', '学习材料待处理'); },
  get 'learning-materials-deferred'() { return technicalWords('学习准入待处理 · 稍后决定', '学习材料待处理 · 稍后决定'); },
  // 索引完成 (Issue #428, S80a; ATTN-009): the material table's own words for it.
  'indexing-completed': '索引完成',
  // A dialogue Task (Issue #52, S17a): away from the foreground dialogue an answer in flight is only 等待回答 (DIALOG-010);
  // a stopped or interrupted one is labelled incomplete in DIALOG-012's words.
  'dialogue-answering': DIALOGUE_WAITING_LABEL,
  'dialogue-answered': '已回答',
  'dialogue-stopped': DIALOGUE_STATE_LABELS.stopped,
  'dialogue-interrupted': DIALOGUE_STATE_LABELS.interrupted,
  'dialogue-failed': DIALOGUE_STATE_LABELS.failed,
  // A Task Intent Draft (Issue #423, slice 7a; TASK-004 to 006): nothing is prepared, sent or started until 准备计划.
  'draft-unfinished': TASK_INTENT_DRAFT_STATE_LABEL,
};

export function globalAttentionStateLabel(item: Pick<GlobalAttentionItemProjection, 'state' | 'facts' | 'object'>): string {
  if (item.state === 'analysis-resumable' && item.facts.stopReason !== undefined) {
    return `任务已中断 · ${RESUMABLE_STOP_REASON_LABELS[item.facts.stopReason]}`;
  }
  if (item.state === 'analysis-completed-with-gaps' && item.facts.completion !== undefined) {
    return completedWithGapsLabel(item.facts.completion.gaps, item.facts.completion.total);
  }
  return item.state === 'analysis-outcome-unconfirmed' && item.object.kind === 'unconfirmed' && item.object.ranges > 0
    ? technicalWords('该单元结果未知', '部分任务结果待确认') : GLOBAL_ATTENTION_STATE_LABELS[item.state];
}

/** The state pill's tone and shape: words and a shape, never colour alone. */
export const GLOBAL_ATTENTION_STATE_PILLS: Readonly<Record<GlobalAttentionStateKey, ReviewPill>> = {
  'apply-outcome-unresolved': { tone: 'blocked', shape: 'square' },
  'import-outcome-uncertain': { tone: 'attention', shape: 'triangle' },
  'import-cleanup-pending': { tone: 'blocked', shape: 'square' },
  'recovery-pending': { tone: 'attention', shape: 'triangle' },
  'recovery-deferred': { tone: 'attention', shape: 'triangle' },
  'manuscript-conflict': { tone: 'attention', shape: 'triangle' },
  'manuscript-conflict-deferred': { tone: 'attention', shape: 'triangle' },
  'analysis-failed': { tone: 'blocked', shape: 'square' },
  'analysis-interrupted': { tone: 'blocked', shape: 'square' },
  'analysis-budget-reached': { tone: 'attention', shape: 'square' },
  'analysis-account-limit': { tone: 'blocked', shape: 'diamond' },
  // The triangle 导入提交结果待确认 has too: an outcome to confirm, never a failure's square.
  'analysis-outcome-unknown': { tone: 'attention', shape: 'triangle' },
  'analysis-outcome-unconfirmed': { tone: 'attention', shape: 'triangle' },
  'analysis-blocked': { tone: 'blocked', shape: 'diamond' },
  'analysis-orphaned': { tone: 'blocked', shape: 'square' },
  'review-failed': { tone: 'blocked', shape: 'square' },
  'review-stopped': { tone: 'blocked', shape: 'square' },
  'analysis-plan-revision': { tone: 'attention', shape: 'triangle' },
  'analysis-plan-moved': { tone: 'attention', shape: 'triangle' },
  'analysis-clarification': { tone: 'attention', shape: 'triangle' },
  'analysis-queued': { tone: 'progress', shape: 'half' },
  'analysis-running': { tone: 'progress', shape: 'half' },
  'analysis-waiting-network': { tone: 'neutral', shape: 'ring' },
  'analysis-waiting-connection': { tone: 'attention', shape: 'triangle' },
  'analysis-waiting-slot': { tone: 'neutral', shape: 'ring' },
  'analysis-waiting-admission': { tone: 'neutral', shape: 'ring' },
  'analysis-waiting-capacity': { tone: 'neutral', shape: 'ring' },
  'analysis-waiting-idle': { tone: 'neutral', shape: 'ring' },
  'analysis-yielded': { tone: 'neutral', shape: 'half' },
  'analysis-cancelling': { tone: 'attention', shape: 'half' },
  'analysis-pausing': { tone: 'attention', shape: 'half' },
  'analysis-paused': { tone: 'neutral', shape: 'half' },
  'analysis-resumable': { tone: 'attention', shape: 'ring' },
  'review-running': { tone: 'progress', shape: 'half' },
  'review-continuable': { tone: 'attention', shape: 'ring' },
  'analysis-completed': { tone: 'good', shape: 'check' },
  'analysis-completed-with-gaps': { tone: 'warn', shape: 'circle' },
  'review-completed': { tone: 'good', shape: 'check' },
  'analysis-prepared': { tone: 'neutral', shape: 'ring' },
  'review-prepared': { tone: 'neutral', shape: 'ring' },
  'draft-unfinished': { tone: 'neutral', shape: 'ring' },
  'analysis-cancelled': { tone: 'neutral', shape: 'square' },
  'maintenance-pending': { tone: 'attention', shape: 'triangle' },
  'maintenance-waiting': { tone: 'neutral', shape: 'ring' },
  'library-attribution-pending': { tone: 'attention', shape: 'triangle' },
  'learning-eligibility-pending': { tone: 'attention', shape: 'triangle' },
  'learning-eligibility-deferred': { tone: 'attention', shape: 'triangle' },
  'learning-materials-pending': { tone: 'attention', shape: 'triangle' },
  'learning-materials-deferred': { tone: 'attention', shape: 'triangle' },
  'indexing-completed': { tone: 'good', shape: 'check' },
  'dialogue-answering': { tone: 'neutral', shape: 'ring' },
  'dialogue-answered': { tone: 'good', shape: 'check' },
  'dialogue-stopped': { tone: 'attention', shape: 'half' },
  'dialogue-interrupted': { tone: 'attention', shape: 'half' },
  'dialogue-failed': { tone: 'blocked', shape: 'square' },
};

/**
 * The closed map of safe next steps (V2-UX-ATTN-007): what the item's own record offers, in the words the
 * product already uses there — the drawer's 查看运行 / 查看审阅 / 重新确认计划, 审阅's 继续审阅, the
 * manuscript's 返回恢复待确认, the import cleanup's 重试放弃清理, the uncertain import's 等待本地核对 and the conflicted
 * suggestion card's 解决冲突….
 */
export const GLOBAL_ATTENTION_NEXT_STEP_LABELS: Readonly<Record<GlobalAttentionNextStep, string>> = {
  'view-apply-receipt': '查看应用凭据',
  'view-run': TASK_BAR_RUN_LINKS['baseline-analysis'],
  'view-review': TASK_BAR_RUN_LINKS['review-run'],
  'reconfirm-plan': TASK_BAR_RECONFIRM,
  'continue-review': REVIEW_ACTION_LABELS.continue,
  'return-to-recovery': '返回恢复待确认',
  'retry-abandon-cleanup': '重试放弃清理',
  'await-local-check': '等待本地核对',
  'resolve-conflict': RESOLVE_CONFLICT_LABEL,
  'answer-clarification': '回答问题',
  // The drawer's own action for a Run the ceiling stopped (Issue #51, S16a; MODEL-017).
  'adjust-budget-redo': '调整预算并重做',
  // The remediation route of a Provider Account Limit (Issue #51, S16b; interaction-spec §1566).
  'resolve-model-service': '处理模型服务',
  'open-network-proxy': '去设置 › 模型服务 › 网络代理',
  // 结果待确认's first step (Issue #51, S16c): which reading ranges are unconfirmed — never a repeat-shaped action.
  'view-unconfirmed': '查看未确认的部分',
  // The drawer's own action for a waiting Run whose plan moved (Issue #536; OFF-008).
  reprepare: TASK_BAR_REPREPARE,
  // The drawer's own action for a Run the launch's ceiling stopped under developer-live (Issue #541).
  redo: TASK_BAR_REDO,
  // A prepared plan nobody started (Issue #423, S77a): the drawer's own entry to it.
  'view-plan': TASK_PLAN_OPEN_START,
  // A 维护事项's own next step (Issue #426, S68b), in the case's words.
  'maintenance-link-proposal': MAINTENANCE_NEXT_STEP_LABELS['link-proposal'],
  'maintenance-link-publication': MAINTENANCE_NEXT_STEP_LABELS['link-publication'],
  'maintenance-write-errata': MAINTENANCE_NEXT_STEP_LABELS['write-errata'],
  'maintenance-conclude': MAINTENANCE_NEXT_STEP_LABELS.conclude,
  // A 资料库 item's own two decisions (Issue #427, S79c), in its card's words.
  'set-library-attribution': LIBRARY_ATTRIBUTE,
  'set-learning-eligibility': LIBRARY_ELIGIBILITY,
  get 'decide-learning-materials'() { return technicalWords('定学习准入…', '处理学习材料…'); },
  'open-dialogue': DIALOGUE_OPEN_LABEL,
  // A 资料库 item's index (Issue #428, S80a): its card, with the layers and 查看分段.
  'view-material-index': '查看索引',
  'continue-draft': TASK_INTENT_DRAFT_CONTINUE,
};
/**
 * A 审阅 started on a selection (Issue #423, S77b; review P3-4): it reads the reading ranges holding the selected words'
 * paragraph as context and puts findings on that paragraph alone — the paragraph, not the words, so the card names it so.
 */
export const REVIEW_ON_SELECTION = '所选段落';
/** The item's action label; no separate next-step narration. */
export function globalAttentionNextStepLine(step: GlobalAttentionNextStep): string {
  return GLOBAL_ATTENTION_NEXT_STEP_LABELS[step];
}

/** The Book an item belongs to; an import that names none yet says so. */
export const GLOBAL_ATTENTION_NO_BOOK = '尚未选择目标图书';

export function globalAttentionBookLabel(book: GlobalAttentionItemProjection['book']): string {
  return book.title === null ? GLOBAL_ATTENTION_NO_BOOK : `《${book.title}》`;
}

/**
 * The Book an item stands under: its Book, or — for a 资料库 item that belongs to no one Book (Issue #427, S79c) — the house,
 * or that it does not belong anywhere yet.
 */
export function globalAttentionItemBookLabel(item: Pick<GlobalAttentionItemProjection, 'book' | 'object'>): string {
  if ((item.object.kind === 'library-material' || item.object.kind === 'library-index') && item.object.scope !== 'book') {
    return item.object.scope === 'house' ? LIBRARY_HOUSE : LIBRARY_NO_ATTRIBUTION;
  }
  return globalAttentionBookLabel(item.book);
}

const IMPORT_RELATIONSHIP_LABELS = {
  'first-manuscript': '作为首份稿件导入',
  'source-only': '作为来源材料导入',
  reimport: '重新导入主稿件',
} as const;

/** What a ledger Task of another kind is, as its own surface names it (Issue #760, S74c). */
export const GLOBAL_ATTENTION_TASK_KIND_LABELS = {
  'initial-evaluation': 'AI7 初评',
  'readers-report': '审稿意见',
  'evaluation-rewrite': '按我的评分重写评语',
  writing: '写作任务',
} as const;

/** The Active Work Object, in its record's own terms. */
export function globalAttentionObjectLabel(object: GlobalAttentionObjectProjection): string {
  switch (object.kind) {
    case 'apply-receipt': return '稿件应用 · 结果待确认';
    case 'import':
      return object.relationship === null
        ? `导入 · ${object.sourceDisplayName}`
        : `导入 · ${object.sourceDisplayName} · ${IMPORT_RELATIONSHIP_LABELS[object.relationship]}`;
    case 'recovery':
      return technicalLayerVisible ? `稿件 · ${object.branchName}` : '稿件';
    case 'manuscript-conflict':
      return object.conflictKind === 'reversal' ? '已应用的修改建议 · 稿件冲突' : '修改建议 · 稿件冲突';
    case 'analysis':
      return `基线分析 · ${BASELINE_ANALYSIS_MODE_LABELS[object.mode]}`;
    // A ledger Task of another kind waiting to start once online, or whose plan moved meanwhile (Issue #760, S74c).
    case 'task':
      return GLOBAL_ATTENTION_TASK_KIND_LABELS[object.taskKind];
    case 'review':
      // A 审阅 on the selection 就这段发起任务… handed over says so (Issue #423, S77b).
      return object.onSelection === true ? `审阅 · 第 ${object.ordinal} 次 · ${REVIEW_ON_SELECTION}` : `审阅 · 第 ${object.ordinal} 次`;
    case 'maintenance':
      return `维护事项 · 第 ${object.ordinal} 项 · ${MAINTENANCE_CLASSIFICATION_LABELS[object.classification]} · 第 ${object.publicationOrdinal} 次发稿版本`;
    case 'library-material':
      return `资料库 · ${LIBRARY_KIND_LABELS[object.materialKind]}「${object.title}」`;
    case 'library-index':
      return `资料索引 · ${LIBRARY_KIND_LABELS[object.materialKind]}「${object.title}」`;
    case 'learning-materials':
      // Only what there is: a Book whose material was all left for later says no 0 条待定 (Issue #61 review).
      return `学习材料 · ${[...(object.pending > 0 ? [`${object.pending} 条待定`] : []), ...(object.deferred > 0 ? [`${object.deferred} 条稍后决定`] : [])].join('，')}`;
    case 'dialogue':
      return dialogueQuestionLine(object.question);
    // 结果待确认 a completed Run left (Issue #757): the Task kind, and what is unconfirmed.
    case 'unconfirmed':
      return `${UNCONFIRMED_TASK_KIND_LABELS[object.taskKind]} · ${unconfirmedWhat(object.ranges, object.steps)}`;
    // A Task Intent Draft (Issue #423, slice 7a): the editor's own sentence, cut short.
    case 'draft':
      return taskIntentDraftTitle(object.goal);
  }
}

/**
 * One why-sentence, at most 60 characters (Owner #1324). Record details remain at the destination.
 * Completion reasons can come from a model or service, so keep their first sentence bounded too.
 */
export function globalAttentionReason(item: GlobalAttentionItemProjection): string {
  return attentionSentence(attentionReason(item));
}

export function attentionSentence(text: string): string {
  const sentence = text.replace(/\s+/gu, ' ').trim().match(/^[^。！？]*[。！？]?/u)?.[0] ?? '';
  const characters = [...sentence];
  return characters.length > 60 ? `${characters.slice(0, 59).join('')}…` : sentence;
}

function attentionReason(item: GlobalAttentionItemProjection): string {
  const { facts } = item;
  switch (item.state) {
    case 'apply-outcome-unresolved': return '这次修改是否已应用尚未确认，请先查看结果。';
    case 'import-outcome-uncertain':
      return '这次导入是否已完成尚未确认，请等待本机核对。';
    case 'import-cleanup-pending':
      return '已放弃导入，剩余文件尚未清理完成。';
    case 'recovery-pending':
      return '中断后的稿件状态需要你确认；系统不会替你选择恢复来源。';
    case 'recovery-deferred':
      return '稿件恢复已留待稍后处理，确认前只能阅读。';
    case 'manuscript-conflict':
    case 'manuscript-conflict-deferred': {
      return item.object.kind === 'manuscript-conflict' && item.object.conflictKind === 'reversal'
        ? '应用后的文字已有改动，解决冲突后才能撤销应用。'
        : '建议所依据的原文已有改动，解决冲突后才能应用建议。';
    }
    case 'analysis-failed':
      return '运行失败，没有形成新的分析结果。';
    case 'analysis-interrupted':
      return technicalWords('运行已在派发后中断；已完成单元的结果与缺口均已保留。', '任务已中断；已完成的部分都已保留。');
    // Issue #541: under developer-live the launch set the ceiling, and the plan cannot raise it.
    case 'analysis-budget-reached':
      return item.nextStep === 'redo'
        ? '已到本次启动的预算上限，保留结果后停下；提高启动预算后可重做。'
        : '已到你设的预算上限，保留结果后停下；调整预算后可重做。';
    case 'analysis-account-limit':
      return '模型服务的账户限额已用尽，处理后可从已保存的进度续行。';
    case 'analysis-outcome-unknown':
    case 'analysis-outcome-unconfirmed':
      return '回答未完整传回，处理与计费结果待确认，AI7 没有自动重发。';
    case 'analysis-blocked':
      return '模型服务当前不可用，任务尚未开始。';
    case 'analysis-orphaned':
      return 'AI7 在运行时关闭，已完成的结果与未完成的范围均已保留。';
    case 'review-failed':
    case 'review-stopped':
      return '部分审阅未完成，已完成的发现仍保留在稿件上。';
    case 'analysis-plan-revision':
      return '计划依据已有变化，请确认新计划后再开始。';
    case 'analysis-plan-moved':
      return '等待联网期间计划依据已有变化，需要重新准备任务。';
    // Issue #422 (S76d; CLAR-004): whether only that step waits, or the whole Task.
    case 'analysis-clarification':
      if (item.facts.clarificationOrigin === 'model') return '模型有一个需要你决定的问题，回答后或等待 24 小时后接着处理。';
      return item.blocked
        ? technicalWords('任务正在等你决定是否重试这个阅读范围。', '任务正在等你决定是否重试这一部分。')
        : technicalWords('这个阅读范围正在等你决定是否重试，其他步骤继续处理。', '有一部分正在等你决定是否重试，其他部分继续处理。');
    case 'analysis-queued':
      return '任务已排队，轮到后自动开始。';
    case 'analysis-waiting-network':
      return '联网后开始任务：恢复联网后，AI7 先核对计划再开始；现在什么都没有运行。';
    case 'analysis-waiting-connection':
      return '模型连接缺少凭据：到设置连接模型服务后，任务会在联网时开始。';
    case 'analysis-waiting-slot':
      // It holds no place in the queue of starts waiting for one, and says so (Issue #632).
      return '已联网，正在等运行名额，尚未开始且不占队列位次。';
    case 'analysis-waiting-idle': return technicalWords('已记录本次运行授权；停下编辑 30 秒且没有编辑操作运行后开始，可以取消任务。', '停下编辑 30 秒后开始，可以取消任务。');
    case 'analysis-yielded': return '让位给你的任务：已完成的部分都已保存，下次空闲后接着处理；预算上限不变。';
    case 'analysis-waiting-capacity':
      return '正在等运行名额，轮到后自动开始。';
    case 'analysis-waiting-admission':
      return '已经联网：AI7 先核对计划，没有变化就开始；现在什么都没有运行。';
    case 'analysis-running':
      return runningReason(facts.progress);
    case 'analysis-cancelling':
      return '正在停止当前步骤，随后不再发送内容，已完成的结果会保留。';
    case 'analysis-pausing':
      return '当前步骤完成后暂停，已完成的结果会保留。';
    case 'analysis-paused':
      return technicalWords('已暂停：已读完的阅读范围都已保存；续行时从下一个接着读，也可以取消它。', '已暂停：已完成的部分都已保存；继续时接着处理，也可以取消它。');
    case 'analysis-resumable': {
      const reason = facts.stopReason;
      if (reason === 'proxy-unreachable') return '代理不可达：去 设置 › 模型服务 › 网络代理 检查代理后续行。';
      if (reason === 'model-service-unreachable') return '模型服务不可达：去 设置 › 模型服务 › 网络代理 检查网络或代理后续行。';
      if (reason === 'outcome-unknown') return '结果待确认：这次运行不能续行，请先查看未确认的部分。';
      return technicalWords('AI7 关闭时任务尚未完成，续行时从下一个阅读范围接着读。', 'AI7 关闭时任务尚未完成，继续时接着处理未完成的部分。');
    }
    case 'review-running': return facts.progress === null ? '正在审阅稿件。' : runningReason(facts.progress);
    case 'review-continuable': return '继续审阅时从未完成的类别接着审。';
    case 'analysis-completed':
      return facts.revisionOrdinal === null ? '分析结果已生成。' : `已形成第 ${facts.revisionOrdinal} 份基线分析。`;
    case 'analysis-completed-with-gaps':
      if (facts.completion?.reason) return facts.completion.reason;
      return facts.revisionOrdinal === null ? '分析结果已生成，部分内容尚未完成。' : technicalWords(`已形成第 ${facts.revisionOrdinal} 份基线分析，保留缺口单元。`, '分析结果已生成，部分内容尚未完成。');
    case 'review-completed':
      return '审阅发现已标到稿件上。';
    // The 任务 panel's own three (Issue #423, S77a): nothing starts by itself, and a cancellation keeps what was read.
    case 'analysis-prepared':
      return '计划已准备好，等待你开始任务。';
    case 'review-prepared':
      return '审阅计划已准备好，等待你开始审阅。';
    case 'analysis-cancelled':
      return facts.revisionOrdinal === null
        ? technicalWords('你取消了这项任务；它还没有读完任何阅读范围，没有形成结果。', '你取消了这项任务；还没有形成结果。')
        : technicalWords(`你取消了这项任务；读完的阅读范围已形成第 ${facts.revisionOrdinal} 份基线分析。`, '你取消了这项任务；已完成的部分形成了一份分析。');
    // 维护事项待处理 (Issue #426, S68b): what the case waits on, in its own terms; nothing outside AI7 is claimed.
    case 'maintenance-waiting':
      return maintenanceWaitingReason(item.object.kind === 'maintenance' ? item.object.classification : 'supersession');
    case 'maintenance-pending':
      switch (item.nextStep) {
        case 'maintenance-link-proposal':
          return '更正还没有关联修改建议：先在稿件中提出修改建议，再在这个维护事项中关联它。';
        case 'maintenance-link-publication':
          // Only a 更正 links a later designation after its 修改建议; a 替代 or 再版 still waits for one.
          if (item.object.kind === 'maintenance' && item.object.classification !== 'correction') return maintenanceWaitingReason(item.object.classification);
          return '修改建议已关联：更正后的文字另行保存里程碑版本、设为发稿版本后，在这个维护事项中关联它。';
        case 'maintenance-write-errata':
          return '勘误还没有写下内容：在这个维护事项中编写勘误。';
        default:
          return '这个维护事项的步骤已经记录：在这个维护事项中记录它的结论。';
      }
    // A 资料库 item (Issue #427, S79c; KB-007, LEARN-006): what it waits for; nothing about it is inferred meanwhile.
    case 'library-attribution-pending':
      return technicalWords('放进资料库以后还没有定归属：定了归属与学习准入，任务才能把它列进「允许参考」。', '还没有定所属图书和使用范围：定好后，任务才能参考它。');
    case 'learning-eligibility-pending':
      return technicalWords('归属已定，学习准入还没有定：没有你的决定，它不会用来学习，任务也还不能把它列进「允许参考」。', '还没有定使用范围：定好前，它不会用来学习，任务也不能参考它。');
    case 'learning-eligibility-deferred':
      return technicalWords('学习准入记为稍后决定：决定之前，它不会用来学习，任务也还不能把它列进「允许参考」。', '使用范围稍后决定：决定之前，它不会用来学习，任务也不能参考它。');
    // A Book's Learning Material (Issue #61, S26b; LEARN-002, LEARN-006): nothing of it is used to learn until the editor says.
    case 'learning-materials-pending':
      return technicalWords('你的反馈与改动里有可以用来学习的材料：学习准入策略还只是建议，没有你的决定，它们不会用来学习。', '你的反馈与改动里有可以用来学习的材料：没有你的决定，它们不会用来学习。');
    case 'learning-materials-deferred':
      return '这些学习材料记为稍后决定：决定之前，它们不会用来学习。';
    // 索引完成 (Issue #428, S80a; ATTN-009, KB-009): how the build went; it asks nothing.
    case 'indexing-completed':
      return materialIndexCompletedReason(item.object.kind === 'library-index' ? item.object.outcome : 'complete');
    // A dialogue Task (Issue #52, S17a; DIALOG-010, 012, 016).
    case 'dialogue-answering':
    case 'dialogue-answered':
    case 'dialogue-stopped':
    case 'dialogue-interrupted':
    case 'dialogue-failed':
      return DIALOGUE_CARD_REASONS[item.state];
    case 'draft-unfinished':
      return '任务草稿尚未开始，可以继续编辑。';
  }
}

/** What a 替代 or 再版 waits for (MAINT-007), in its own words. */
function maintenanceWaitingReason(classification: string): string {
  return classification === 'reissue'
    ? '再版等待另设的发稿版本：另行设为发稿版本后，在这个维护事项中关联它。'
    : '替代等待另设的发稿版本：另行设为发稿版本后，在这个维护事项中关联它。';
}

/** A Run in flight: its declared step, and — while it reads range by range — how far it has come (V2-UX-ATTN-004). */
function runningReason(progress: GlobalAttentionItemProjection['facts']['progress']): string {
  if (progress === null) return '运行中';
  const stage = RUN_LIVENESS_STAGE_LABELS[progress.stage];
  return progress.stage === 'units' ? `${stage} · ${technicalWords(`已完成 ${progress.unitsSettled}/${progress.unitsTotal} 个阅读范围`,
    `已完成约 ${progress.unitsTotal === 0 ? 0 : Math.floor((progress.unitsSettled / progress.unitsTotal) * 100)}%`)}` : stage;
}

/** When the state began — or, in 最近完成, when the work completed — in local time. */
export function globalAttentionTimeLine(group: GlobalAttentionGroupKey, at: string, state?: GlobalAttentionStateKey | TaskOverviewItemProjection['state']): string {
  const verb = state === 'cancelled' || state === 'analysis-cancelled' ? '取消于'
    : state === 'stopped' || state === 'review-stopped' || state === 'dialogue-stopped' ? '停止于' : '完成于';
  return `${group === 'recent' ? verb : '记录于'} ${localInstantLabel(at)}`;
}

// ---- the whole view as data ------------------------------------------------------------------------------

export interface GlobalAttentionItemView {
  readonly itemId: string;
  readonly state: GlobalAttentionStateKey;
  readonly book: string;
  readonly object: string;
  readonly stateLabel: string;
  readonly pill: ReviewPill;
  readonly reason: string;
  readonly nextStep: string;
  readonly time: string;
  /** The item's one control opens its record; its name says which Book and which object. */
  readonly openName: string;
}

export interface GlobalAttentionGroupView {
  readonly key: GlobalAttentionGroupKey;
  readonly heading: string;
  readonly countLine: string;
  readonly counted: boolean;
  readonly empty: string | null;
  readonly truncated: string | null;
  readonly items: ReadonlyArray<GlobalAttentionItemView>;
}

/** The screen as data: the four groups in the projection's fixed order, each item in words. */
export function globalAttentionView(projection: GlobalAttentionProjection): ReadonlyArray<GlobalAttentionGroupView> {
  return projection.groups.map((group) => ({
    key: group.key,
    heading: GLOBAL_ATTENTION_GROUP_LABELS[group.key],
    countLine: globalAttentionGroupCountLine(group.key, group.total),
    counted: globalAttentionGroupCounts(group.key),
    empty: group.total === 0 ? GLOBAL_ATTENTION_EMPTY_LINES[group.key] : null,
    truncated: globalAttentionTruncatedLine(group.key, group.items.length, group.total),
    items: group.items.map((entry): GlobalAttentionItemView => {
      const book = globalAttentionItemBookLabel(entry);
      const object = globalAttentionObjectLabel(entry.object);
      return {
        itemId: entry.itemId,
        state: entry.state,
        book,
        object,
        stateLabel: globalAttentionStateLabel(entry),
        pill: GLOBAL_ATTENTION_STATE_PILLS[entry.state],
        reason: globalAttentionReason(entry),
        nextStep: globalAttentionNextStepLine(entry.nextStep),
        time: globalAttentionTimeLine(group.key, entry.at, entry.state),
        openName: `${book} · ${object}`,
      };
    }),
  }));
}

// ---- material and knowledge-base items (V2-UX-ATTN-009) --------------------------------------------------

/**
 * Where material and knowledge-base items go when their records exist: a failed external source retention
 * to 异常与结果待确认, a pending 资料库 attribution or Learning Eligibility to 等待你的决定, a completed
 * indexing to 最近完成 — the same four groups, and no fifth (ADR 0077). The 资料库 decisions have their records
 * since Issue #427 (S79c), and the index since Issue #428 (S80a), and their items carry these states; the retention
 * (SRC-013) arrives with its own slice, so for it this table places it and no item is invented from it.
 */
export const GLOBAL_ATTENTION_MATERIAL_GROUPS = [
  { material: 'external-source-retention-failed', label: '外部来源留存失败', group: 'exceptions' },
  { material: 'library-attribution-pending', label: '资料库归属待定', group: 'decisions' },
  { material: 'learning-eligibility-pending', get label() { return technicalWords('学习准入待定', '使用范围待定'); }, group: 'decisions' },
  { material: 'learning-materials-pending', get label() { return technicalWords('学习准入待处理', '学习材料待处理'); }, group: 'decisions' },
  { material: 'indexing-completed', label: '索引完成', group: 'recent' },
] as const satisfies ReadonlyArray<{ material: string; label: string; group: GlobalAttentionGroupKey }>;

// ---- the technical layer --------------------------------------------------------------------------------

export const GLOBAL_ATTENTION_TECHNICAL_ITEM = '记录';
