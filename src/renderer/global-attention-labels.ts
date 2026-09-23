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
import { TASK_BAR_RECONFIRM, TASK_BAR_RUN_LINKS } from './task-drawer-labels.js';
import { RESOLVE_CONFLICT_LABEL } from './editorial-mark-labels.js';
import { PROPOSAL_CONFLICT_CLASSIFICATION, REVERSAL_CONFLICT_LINE } from './proposal-conflict-labels.js';

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

/** Each item's exact state or named decision, in the words its own record already uses. */
export const GLOBAL_ATTENTION_STATE_LABELS: Readonly<Record<GlobalAttentionStateKey, string>> = {
  'import-outcome-uncertain': '导入提交结果待确认',
  'import-cleanup-pending': '放弃清理尚未完成',
  'recovery-pending': '恢复待确认状态',
  'recovery-deferred': '恢复待确认状态 · 已稍后处理',
  // 稿件冲突's own classification (Issue #57); 暂不处理 records the conflict and leaves it standing (ADR 0085 §3).
  'manuscript-conflict': PROPOSAL_CONFLICT_CLASSIFICATION,
  'manuscript-conflict-deferred': `${PROPOSAL_CONFLICT_CLASSIFICATION} · 暂不处理`,
  'analysis-failed': '运行失败',
  'analysis-interrupted': '已中断',
  'analysis-blocked': '派发前已阻止',
  'analysis-orphaned': '已中断',
  'review-failed': '运行失败',
  'review-stopped': '中途停止',
  // V2-UX-ATTN-003: the named decision itself, never a generic 待审批.
  'analysis-plan-revision': '计划修订',
  // A Clarification Request (Issue #422, S76d): the bar's own words for it.
  'analysis-clarification': '等你回答',
  'analysis-queued': '正在排队',
  'analysis-running': '运行中',
  // A Run in Connectivity Wait (Issue #502), in the drawer's words for what it waits for: never 运行中, never 已暂停.
  'analysis-waiting-network': '等待网络',
  'analysis-waiting-connection': '需要处理模型连接',
  'analysis-waiting-slot': '等待运行名额',
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
};

/** The state pill's tone and shape: words and a shape, never colour alone. */
export const GLOBAL_ATTENTION_STATE_PILLS: Readonly<Record<GlobalAttentionStateKey, ReviewPill>> = {
  'import-outcome-uncertain': { tone: 'attention', shape: 'triangle' },
  'import-cleanup-pending': { tone: 'blocked', shape: 'square' },
  'recovery-pending': { tone: 'attention', shape: 'triangle' },
  'recovery-deferred': { tone: 'attention', shape: 'triangle' },
  'manuscript-conflict': { tone: 'attention', shape: 'triangle' },
  'manuscript-conflict-deferred': { tone: 'attention', shape: 'triangle' },
  'analysis-failed': { tone: 'blocked', shape: 'square' },
  'analysis-interrupted': { tone: 'blocked', shape: 'square' },
  'analysis-blocked': { tone: 'blocked', shape: 'diamond' },
  'analysis-orphaned': { tone: 'blocked', shape: 'square' },
  'review-failed': { tone: 'blocked', shape: 'square' },
  'review-stopped': { tone: 'blocked', shape: 'square' },
  'analysis-plan-revision': { tone: 'attention', shape: 'triangle' },
  'analysis-clarification': { tone: 'attention', shape: 'triangle' },
  'analysis-queued': { tone: 'progress', shape: 'half' },
  'analysis-running': { tone: 'progress', shape: 'half' },
  'analysis-waiting-network': { tone: 'neutral', shape: 'ring' },
  'analysis-waiting-connection': { tone: 'attention', shape: 'triangle' },
  'analysis-waiting-slot': { tone: 'neutral', shape: 'ring' },
  'analysis-cancelling': { tone: 'attention', shape: 'half' },
  'analysis-pausing': { tone: 'attention', shape: 'half' },
  'analysis-paused': { tone: 'neutral', shape: 'half' },
  'analysis-resumable': { tone: 'attention', shape: 'ring' },
  'review-running': { tone: 'progress', shape: 'half' },
  'review-continuable': { tone: 'attention', shape: 'ring' },
  'analysis-completed': { tone: 'good', shape: 'check' },
  'analysis-completed-with-gaps': { tone: 'good', shape: 'circle' },
  'review-completed': { tone: 'good', shape: 'check' },
};

/**
 * The closed map of safe next steps (V2-UX-ATTN-007): what the item's own record offers, in the words the
 * product already uses there — the drawer's 查看运行 / 查看审阅 / 重新确认计划, 审阅's 继续审阅, the
 * manuscript's 返回恢复待确认, the import cleanup's 重试放弃清理, the uncertain import's 等待本地核对 and the conflicted
 * suggestion card's 解决冲突….
 */
export const GLOBAL_ATTENTION_NEXT_STEP_LABELS: Readonly<Record<GlobalAttentionNextStep, string>> = {
  'view-run': TASK_BAR_RUN_LINKS['baseline-analysis'],
  'view-review': TASK_BAR_RUN_LINKS['review-run'],
  'reconfirm-plan': TASK_BAR_RECONFIRM,
  'continue-review': REVIEW_ACTION_LABELS.continue,
  'return-to-recovery': '返回恢复待确认',
  'retry-abandon-cleanup': '重试放弃清理',
  'await-local-check': '等待本地核对',
  'resolve-conflict': RESOLVE_CONFLICT_LABEL,
  'answer-clarification': '回答问题',
};
/** The two scopes a question can have (CLAR-004), in the card's own words. */
export const GLOBAL_ATTENTION_CLARIFICATION_WAITING = '任务等待你的说明';
export const GLOBAL_ATTENTION_CLARIFICATION_CONTINUING = '该步骤等待说明 · 其他步骤仍在继续';
/** The prefix the product already puts before a record's safe next action. */
export const GLOBAL_ATTENTION_NEXT_STEP_PREFIX = '安全的下一步：';

export function globalAttentionNextStepLine(step: GlobalAttentionNextStep): string {
  return `${GLOBAL_ATTENTION_NEXT_STEP_PREFIX}${GLOBAL_ATTENTION_NEXT_STEP_LABELS[step]}`;
}

/** The Book an item belongs to; an import that names none yet says so. */
export const GLOBAL_ATTENTION_NO_BOOK = '尚未选择目标图书';

export function globalAttentionBookLabel(book: GlobalAttentionItemProjection['book']): string {
  return book.title === null ? GLOBAL_ATTENTION_NO_BOOK : `《${book.title}》`;
}

const IMPORT_RELATIONSHIP_LABELS = {
  'first-manuscript': '作为首份稿件导入',
  'source-only': '作为来源材料导入',
  reimport: '重新导入主稿件',
} as const;

/** The Active Work Object, in its record's own terms. */
export function globalAttentionObjectLabel(object: GlobalAttentionObjectProjection): string {
  switch (object.kind) {
    case 'import':
      return object.relationship === null
        ? `导入 · ${object.sourceDisplayName}`
        : `导入 · ${object.sourceDisplayName} · ${IMPORT_RELATIONSHIP_LABELS[object.relationship]}`;
    case 'recovery':
      return `稿件 · ${object.branchName}`;
    case 'manuscript-conflict':
      return object.conflictKind === 'reversal' ? '已应用的修改建议 · 稿件冲突' : '修改建议 · 稿件冲突';
    case 'analysis':
      return `基线分析 · ${BASELINE_ANALYSIS_MODE_LABELS[object.mode]}`;
    case 'review':
      return `审阅 · 第 ${object.ordinal} 次`;
  }
}

function quoted(labels: ReadonlyArray<string>): string {
  return labels.map((label) => `「${label}」`).join('');
}

/**
 * Why the item is here (V2-UX-ATTN-007), from the record's own facts: the sentences the record's own screen
 * already says, a Run's declared step and progress, or the Review Run's categories with their states. Never
 * a manuscript excerpt.
 */
export function globalAttentionReason(item: GlobalAttentionItemProjection): string {
  const { facts } = item;
  switch (item.state) {
    case 'import-outcome-uncertain':
      return '本地证据目前无法证明这次原子提交已经完成或确定未提交；已阻止重试、放弃和清理。';
    case 'import-cleanup-pending':
      return '放弃意图已经持久化，安全清理尚未完成；已阻止继续导入和新权威引用。';
    case 'recovery-pending':
      return '中断后的稿件状态需要你确认；系统不会替你选择恢复来源。';
    case 'recovery-deferred':
      return '该分支已稍后处理，普通编辑保持只读；请返回恢复比较作出决定。';
    case 'manuscript-conflict':
    case 'manuscript-conflict-deferred': {
      const why = item.object.kind === 'manuscript-conflict' && item.object.conflictKind === 'reversal'
        ? `${REVERSAL_CONFLICT_LINE}；在解决之前不能撤销这次应用。`
        : '建议所依据的原文已经改过；在解决之前不能接受或应用这条建议。';
      return item.state === 'manuscript-conflict-deferred' ? `${why}已记下暂不处理，这处冲突仍未解决。` : why;
    }
    case 'analysis-failed':
      return '运行失败，没有形成新的结果集修订版。';
    case 'analysis-interrupted':
      return '运行已在派发后中断；已完成单元的结果与缺口均已保留。';
    case 'analysis-blocked':
      return '授权已记录，派发前阻止：当前启动没有可执行的路由。';
    case 'analysis-orphaned':
      return '服务在这次运行期间停止，运行已中断；已完成单元的结果与缺口保留在分析账本中。';
    case 'review-failed':
    case 'review-stopped':
      return facts.categories.length === 0
        ? '有类别没有写到稿件上。'
        : facts.categories.map((category) => `「${category.label}」${category.stateLabel}`).join('；');
    case 'analysis-plan-revision':
      return '计划冻结之后，它的关键内容已经变化；原计划不能再开始。';
    // Issue #422 (S76d; CLAR-004): whether only that step waits, or the whole Task.
    case 'analysis-clarification':
      return item.blocked
        ? `${GLOBAL_ATTENTION_CLARIFICATION_WAITING}：它想知道要不要把一个阅读范围安全地再试一次。`
        : `${GLOBAL_ATTENTION_CLARIFICATION_CONTINUING}：它想知道要不要把一个阅读范围安全地再试一次。`;
    case 'analysis-queued':
      return '已进入 AI7 调度器（单槽位）。';
    case 'analysis-waiting-network':
      return '联网后开始任务：恢复联网后，AI7 先核对计划再开始；现在什么都没有运行。';
    case 'analysis-waiting-connection':
      return '模型连接缺少凭据：到设置连接模型服务后，任务会在联网时开始。';
    case 'analysis-waiting-slot':
      return '另一项任务正在运行；它结束后，这项任务在联网时开始。';
    case 'analysis-running':
      return runningReason(facts.progress);
    case 'analysis-cancelling':
      return `你取消了这项任务；正在进行的这一步完成后停止，之后不再发送任何内容 · ${runningReason(facts.progress)}`;
    case 'analysis-pausing':
      return `你暂停了这项任务；正在进行的这一步完成后停下，已完成的部分都会保存 · ${runningReason(facts.progress)}`;
    case 'analysis-paused':
      return '已暂停：已读完的阅读范围都已保存；续行时从下一个接着读，也可以取消它。';
    case 'analysis-resumable':
      return 'AI7 关闭时这项任务正在运行；已读完的阅读范围都已保存。续行时从下一个接着读，在此之前不会发送任何内容。';
    case 'review-running': {
      const current = facts.categories[0];
      if (current === undefined) return '正在审阅';
      const progress = facts.progress === null ? '' : ` · ${runningReason(facts.progress)}`;
      return `${current.stateLabel}「${current.label}」${progress}`;
    }
    case 'review-continuable': {
      const next = facts.categories[0];
      return next === undefined ? '继续审阅时从没有完成的类别接着审。' : `「${next.label}」${next.detail ?? next.stateLabel}`;
    }
    case 'analysis-completed':
      return facts.revisionOrdinal === null ? '已形成结果集修订版。' : `已形成第 ${facts.revisionOrdinal} 份基线分析。`;
    case 'analysis-completed-with-gaps':
      return facts.revisionOrdinal === null ? '已形成结果集修订版 · 有缺口单元。' : `已形成第 ${facts.revisionOrdinal} 份基线分析，保留缺口单元。`;
    case 'review-completed':
      return facts.categories.length === 0 ? '审阅发现已标到稿件上。' : `已审：${quoted(facts.categories.map((category) => category.label))}；发现已标到稿件上。`;
  }
}

/** A Run in flight: its declared step, and — while it reads range by range — how far it has come (V2-UX-ATTN-004). */
function runningReason(progress: GlobalAttentionItemProjection['facts']['progress']): string {
  if (progress === null) return '运行中';
  const stage = RUN_LIVENESS_STAGE_LABELS[progress.stage];
  return progress.stage === 'units' ? `${stage} · 已完成 ${progress.unitsSettled}/${progress.unitsTotal} 个阅读范围` : stage;
}

/** When the state began — or, in 最近完成, when the work completed — in local time. */
export function globalAttentionTimeLine(group: GlobalAttentionGroupKey, at: string): string {
  return `${group === 'recent' ? '完成于' : '记录于'} ${localInstantLabel(at)}`;
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
      const book = globalAttentionBookLabel(entry.book);
      const object = globalAttentionObjectLabel(entry.object);
      return {
        itemId: entry.itemId,
        state: entry.state,
        book,
        object,
        stateLabel: GLOBAL_ATTENTION_STATE_LABELS[entry.state],
        pill: GLOBAL_ATTENTION_STATE_PILLS[entry.state],
        reason: globalAttentionReason(entry),
        nextStep: globalAttentionNextStepLine(entry.nextStep),
        time: globalAttentionTimeLine(group.key, entry.at),
        openName: `${book} · ${object}`,
      };
    }),
  }));
}

// ---- material and knowledge-base items (V2-UX-ATTN-009) --------------------------------------------------

/**
 * Where material and knowledge-base items go when their records exist: a failed external source retention
 * to 异常与结果待确认, a pending 资料库 attribution or Learning Eligibility to 等待你的决定, a completed
 * indexing to 最近完成 — the same four groups, and no fifth (ADR 0077). None of these records exists yet
 * (KB-007, SRC-013 and the index arrive with their own slices), so this table places them and no item is
 * invented from it.
 */
export const GLOBAL_ATTENTION_MATERIAL_GROUPS = [
  { material: 'external-source-retention-failed', label: '外部来源留存失败', group: 'exceptions' },
  { material: 'library-attribution-pending', label: '资料库归属待定', group: 'decisions' },
  { material: 'learning-eligibility-pending', label: '学习准入待定', group: 'decisions' },
  { material: 'indexing-completed', label: '索引完成', group: 'recent' },
] as const satisfies ReadonlyArray<{ material: string; label: string; group: GlobalAttentionGroupKey }>;

// ---- the technical layer --------------------------------------------------------------------------------

export const GLOBAL_ATTENTION_TECHNICAL_ITEM = '记录';
