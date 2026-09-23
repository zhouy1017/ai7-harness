import type { TaskPlanKind, TaskPlanProjection, TaskPlanRunControlProjection, TaskPlanStartReadiness, TaskPlanStateKey } from '../shared/protocol.js';
import { RUN_LIVENESS_STAGE_LABELS, attemptStateLabel, elapsedLabel, localInstantLabel, runStepIsStale } from './plan-preview-labels.js';
import type { ReviewPill } from './review-labels.js';

/**
 * Every word of the Task Drawer (Issue #418, plan slice S72; editor-surfaces §6 ③, §10 用词,
 * V2-UX-PLAN-001 to 012, TASK-030, TASK-039/040, LAYER-002) that the plan projection does not carry.
 * The projection's own sentences — the goal, the steps, what is sent, what the Run will not do — are
 * shown as they come; these are the words around them: the header, the two modes, the section names, the
 * footer PLAN-007 fixes, and the reasons the actions this slice does not bring yet are unavailable. Since
 * Issue #420 (S74a) they include the authorization bar's (§6 常驻授权条, V2-UX-AUTH-001 to 007): its summary,
 * its statement, and which of its actions each state offers. Pure, so the unit suite pins every string
 * byte for byte.
 */

// ---- the drawer ---------------------------------------------------------------------------------------

export const TASK_DRAWER_TITLE = '任务计划';
/** `← 任务` returns to the 任务 panel (TASK-044), which arrives with S77; until then it says so. */
export const TASK_DRAWER_BACK = '← 任务';
export const TASK_DRAWER_BACK_REASON = '任务面接通后可用';
export const TASK_DRAWER_CLOSE = '关闭';
export const TASK_DRAWER_MODE_GROUP = '计划显示方式';
export const TASK_DRAWER_LOADING = '正在读取任务计划…';
export const TASK_DRAWER_UNAVAILABLE = '无法读取这项任务的计划。';
/** V2-UX-PLAN-007: the plan surface says, whatever else it shows, that the plan itself authorizes nothing. */
export const TASK_DRAWER_FOOTER = '计划说明，不是运行授权';
/** The entry each surface that raises a Task offers beside its one-line summary (S72 D4). */
export const TASK_PLAN_OPEN = '查看计划';
/**
 * The same entry while the Task has not been started (S74a A5): the authorization moved off every card
 * into the drawer's bar, so the card's one action now names where the start is.
 */
export const TASK_PLAN_OPEN_START = '查看计划并开始';

/** The two modes (V2-UX-PLAN-010): 精简 by default, remembered per editor. */
export type TaskDrawerMode = 'compact' | 'full';
export const TASK_DRAWER_MODES: Readonly<Record<TaskDrawerMode, string>> = { compact: '精简', full: '完整' };
/** Where the editor's choice of mode is remembered: this renderer's own storage, never a record. */
export const TASK_DRAWER_MODE_KEY = 'ai7.taskDrawer.mode';

/** The mode a stored value names; anything but `full` — nothing stored, storage unavailable — is 精简. */
export function taskDrawerModeOf(stored: string | null): TaskDrawerMode {
  return stored === 'full' ? 'full' : 'compact';
}

/**
 * The central destinations the drawer stays open beside (S72 D3): the manuscript, 工作概览 (which reads
 * `imported` while it still carries an import's completion), ②A and ②B of the Book whose plan it shows.
 * Any other screen closes it.
 */
export const TASK_DRAWER_SCREENS: ReadonlyArray<string> = ['editor', 'book-overview', 'imported', 'book-analysis', 'book-review'];

// ---- the state pill: words and a shape, never colour alone (editor-surfaces §0.3) ---------------------------

export const TASK_PLAN_STATE_PILLS: Readonly<Record<TaskPlanStateKey, ReviewPill>> = {
  ready: { tone: 'neutral', shape: 'ring' },
  changed: { tone: 'attention', shape: 'triangle' },
  unconnected: { tone: 'blocked', shape: 'diamond' },
  recorded: { tone: 'neutral', shape: 'dash' },
  blocked: { tone: 'blocked', shape: 'square' },
  running: { tone: 'progress', shape: 'half' },
  settled: { tone: 'good', shape: 'circle' },
  stopped: { tone: 'blocked', shape: 'square' },
  // Connectivity Wait (Issue #502): 离线 before a start — its own shape among the pre-start states — a Run that
  // waits, hollow beside the half-filled 运行中, and one cancelled while it waited, whose dash says nothing ran and
  // never reads as the square of 已中断 (OFF-012).
  offline: { tone: 'attention', shape: 'dash' },
  waiting: { tone: 'progress', shape: 'ring' },
  cancelled: { tone: 'neutral', shape: 'dash' },
  // 取消任务 (Issue #422): 正在取消 is half-filled like 运行中, in attention's tone and its own words, since the Run is
  // still stopping; a Run cancelled after it began reading keeps the dash of every 已取消, never the square of 已中断.
  cancelling: { tone: 'attention', shape: 'half' },
  'cancelled-after-start': { tone: 'neutral', shape: 'dash' },
  // 暂停 and 续行 (Issue #422, S76b): 正在暂停 is half-filled in attention's tone as 正在取消 is; 已暂停 keeps the half
  // shape it stopped with, quietly; 任务已中断 · 可续行 is a ring that asks for the editor.
  pausing: { tone: 'attention', shape: 'half' },
  paused: { tone: 'neutral', shape: 'half' },
  resumable: { tone: 'attention', shape: 'ring' },
};

// ---- the goal block (S72 D5) ------------------------------------------------------------------------------

/**
 * 修改 returns to the composer (撰写框), which arrives with the 任务 panel; until then it is shown with this reason. The
 * plan itself is edited in 完整 (Issue #419), which 返回修改 opens.
 */
export const TASK_PLAN_EDIT = '修改';
export const TASK_PLAN_EDIT_REASON = '回到撰写随任务面板提供';

/** The context chips in their order: 书 · 位置 · 已选字数 · 任务输入修订版 · 工序. */
export function taskPlanChips(chips: TaskPlanProjection['goal']['chips']): ReadonlyArray<{ key: string; text: string }> {
  return [
    { key: 'book', text: chips.book },
    { key: 'position', text: chips.position },
    ...(chips.selectedGraphemes === null ? [] : [{ key: 'selected', text: `已选 ${groupedCount(chips.selectedGraphemes)} 字` }]),
    { key: 'revision', text: `任务输入修订版 ${chips.taskInputRevision}` },
    { key: 'procedure', text: `工序「${chips.procedure}」` },
  ];
}

/** TASK-039/040's one line: preparing the Task saved a revision, so later editing leaves the Task as it is. */
export function taskPlanSavedLine(revisionLabel: string): string {
  return `已为任务保存修订版 ${revisionLabel}，之后的编辑不影响这项任务。`;
}

/** A count with its thousands grouped, the same text on every host. */
export function groupedCount(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/gu, ',');
}

// ---- 精简 (PLAN-010): one card, five rows, and the way to the whole plan -----------------------------------

export const TASK_PLAN_COMPACT_TERMS = ['处理', '发送', '会得到', '不会', '中途'] as const;
export const TASK_PLAN_FULL_LINK = '完整计划（6 段）';
/** §6: the same link on a plan the editor can edit says so. */
export const TASK_PLAN_FULL_LINK_EDITABLE = '完整计划（6 段）· 可以改步骤与限制';
/** The usage figure is a ceiling the Run cannot pass, never a forecast of what it will use. */
export const TASK_PLAN_CEILING_NOTE = '上限，不是预测';

/** The five rows of 精简, each one line built from the projection's own sentences. */
export function taskPlanCompactRows(plan: TaskPlanProjection): ReadonlyArray<readonly [string, string]> {
  const usage = `用量：${plan.service.usage}${plan.service.usageIsCeiling ? `（${TASK_PLAN_CEILING_NOTE}）` : ''}`;
  return [
    ['处理', plan.scope.reference.length === 0 ? plan.scope.process : `${plan.scope.process}；参考 ${plan.scope.reference.join('、')}`],
    ['发送', `${plan.service.send} · ${usage} · ${plan.service.budgetCeiling}`],
    ['会得到', plan.outcomes.join('；')],
    ['不会', plan.notDo.editorial.join(' · ')],
    ['中途', plan.participation.after === null ? plan.participation.during : `${plan.participation.during}；结束后：${plan.participation.after}`],
  ];
}

// ---- 完整 (PLAN-002): the six sections, the two columns, the technical layer ---------------------------------

export const TASK_PLAN_SECTIONS = ['要做什么 · 会得到什么', '处理哪些内容 · 参考什么', '怎么做', '你会参与的地方', '预计与限制', '会得到 / 不会做'] as const;
export const TASK_PLAN_GOAL_TERMS = ['做什么', '会得到'] as const;
/** TASK-030: what is processed, what may be referred to and what may be sent are never one control. */
export const TASK_PLAN_SCOPE_TERMS = ['要处理', '允许参考', '可能发送', '不会读'] as const;
export const TASK_PLAN_NO_REFERENCE = '不参考其他材料';
export const TASK_PLAN_SERVICE_TERMS = ['模型角色', '提供方', '提供方状态', '会发送', '发送内容类别', '用量上限', '所需时间', '预算上限', '账户限额'] as const;
export const TASK_PLAN_RESULT_TERMS = ['可能产生', '不会做'] as const;
export const TASK_PLAN_AFTERWARDS = '结束后';
/** PLAN-012's two columns. */
export const TASK_PLAN_BOUNDARY_COLUMNS = ['运行中 AI7 可以自己调整', '这些一变就先停下来问你'] as const;
export const TASK_PLAN_NO_ADAPTATION = '无';
export const TASK_PLAN_LOCKED = '固定';
export const TASK_PLAN_LOCKED_NOTE = '标「固定」的由授权规则固定，不能改成运行中自己调整。';
/**
 * `设为快速开始默认…` is its own action (AUTH-009, TASK-019; Issue #421): it sets the Book's 默认执行规则 from the plan
 * on show, after a confirmation that lists what the rule binds. Starting a Task never sets one.
 */
export const TASK_PLAN_DEFAULT_RULE = '设为快速开始默认…';
export const TASK_PLAN_DEFAULT_RULE_HEADING = '设为快速开始默认';
/** What setting the rule means, above the rows it binds: a rule never starts anything by itself (TASK-028). */
export const TASK_PLAN_DEFAULT_RULE_LEAD =
  '以后用快速开始更新这本书的分析时，AI7 会先准备计划：计划与下面这些一致时直接开始，不再停下来等你确认；有任何不同都会停在计划上，等你看过再开始。规则不会自己开始任何任务。';
export const TASK_PLAN_DEFAULT_RULE_CONFIRM = '设为默认';
export const TASK_PLAN_DEFAULT_RULE_CANCEL = '取消';
export const TASK_PLAN_DEFAULT_RULE_FAILED = '无法设为快速开始默认。';
export function taskPlanDefaultRuleSet(name: string): string {
  return `已设为快速开始默认：${name}`;
}
/** The Book's rule for this plan's pattern, beside the action. */
export function taskPlanDefaultRuleCurrent(current: NonNullable<TaskPlanProjection['defaultRule']['current']>): string {
  if (current.state === 'deactivated') return `这本书的默认执行规则：${current.name}（已停用）`;
  return `这本书的默认执行规则：${current.name}（使用中${current.fromThisPlan ? '，由这份计划设定' : ''}）`;
}
/** 快速开始后 (S75 D5): the quiet notice on a Task quick start started, and the way to the rule. */
export function taskPlanQuickStarted(name: string): string {
  return `已按默认执行规则「${name}」快速开始`;
}
export const TASK_PLAN_VIEW_RULES = '查看规则';
/** A quick start that stopped at the plan (TASK-026): the reason, beside the bar's actions. */
export function taskPlanQuickStartFellBack(reasons: ReadonlyArray<string>): string {
  return `快速开始没有开始这项任务：${reasons.join('')}`;
}
/** The heading of the engineer's 不会做 inside 查看技术详情 (editor-surfaces §10). */
export const TASK_PLAN_TECHNICAL_NOT_DO = '技术性的不会做';

// ---- the plan's key content changed (S72 D8) --------------------------------------------------------------

export const TASK_PLAN_DRIFT_HEADING = '计划的关键内容已变化';
export const TASK_PLAN_DRIFT_VIEW = '查看计划修订';
export const TASK_PLAN_DRIFT_COLUMNS = ['内容', '原计划', '重新确认后', '性质'] as const;
/** §10: 物质字段 / 派生后果 read 关键内容 / 随之变化; the editor's own edit reads 你改的 (Issue #419). */
export const TASK_PLAN_MATERIALITY_LABELS = { material: '关键内容', derived: '随之变化', edited: '你改的' } as const satisfies Record<'material' | 'derived' | 'edited', string>;

// ---- the editable plan (Issue #419, plan slice S73; §6 可编辑, V2-UX-PLAN-011) -------------------------------------

/** The editor's own mark on each item they changed, and on the plan's changes. */
export const TASK_PLAN_EDIT_TAG = '你改的';
/** What a step left out, and an adaptation withdrawn, read as — beside the tag. */
export const TASK_PLAN_EDIT_STEP_REMOVED = '不做';
export const TASK_PLAN_EDIT_ADAPTATION_WITHDRAWN = '不允许';
/** `×` is the control's glyph; what it does is its name, for a reader who does not see it. */
export function taskPlanEditRemoveStep(label: string): string {
  return `去掉这一步：${label}`;
}
export function taskPlanEditWithdraw(label: string): string {
  return `不允许：${label}`;
}
export const TASK_PLAN_EDIT_RESTORE = '恢复';
/** Why the rest of the steps take no edit: the analysis's steps are its procedure. */
export const TASK_PLAN_EDIT_STEPS_NOTE = '这项分析的步骤由分析工序决定：可以去掉「核对与抽检」，不能改写、增加或调换顺序。';
/** Moving an adaptation into the right column needs a Run that can stop and ask, which Clarification Requests bring. */
export const TASK_PLAN_EDIT_ASK_FIRST_NOTE = '改成「先问你」要等澄清请求，暂不提供。';
/** PLAN-011's count of what the editor changed and has not yet made the plan. */
export function taskPlanEditCount(count: number): string {
  return `你改了 ${count} 处`;
}
/** With a key-content change pending, the edits wait for the version 重新确认计划 writes. */
export function taskPlanEditCountAfterDrift(count: number): string {
  return `你改了 ${count} 处；重新确认计划后再更新计划`;
}
/** The edit that made the version shown, with its time (PLAN-011: recorded with actor and time). */
export function taskPlanLastEdit(edit: NonNullable<TaskPlanProjection['edit']['lastEdit']>): string {
  const changes = edit.entries.map((entry) => `${entry.label}：${entry.prior} → ${entry.proposed}`).join('；');
  return `第 ${edit.ordinal} 版由你修改（${localInstantLabel(edit.recordedAt)}）：${changes}`;
}

// ---- the authorization bar (Issue #420, S74a; §6 常驻授权条, V2-UX-AUTH-001 to 007, §10) --------------------

/** AUTH-002 as ADR 0077 revised it: the one start action; the word 授权 is never on the button. */
export const TASK_BAR_START = '开始任务';
/**
 * 返回修改 opens the plan's editing — 完整, focused on the first thing that can change (Issue #419). A plan that takes no
 * edit says why; a kind that keeps no plan versions says this.
 */
export const TASK_BAR_REVISE = '返回修改';
export const TASK_BAR_REVISE_REASON = '这类任务的计划不能在这里修改';
/** PLAN-011: with edits pending, 更新计划 takes the start's place; 撤销修改 lets them go. */
export const TASK_BAR_UPDATE_PLAN = '更新计划';
export const TASK_BAR_DISCARD_EDITS = '撤销修改';
/** 保存草稿 would leave the edits unsaved while saying the plan is saved. */
export const TASK_BAR_SAVE_DRAFT_EDITING_REASON = '先更新计划或撤销修改';
export const TASK_BAR_UPDATE_FAILED = '无法更新计划。';
/** 保存草稿 closes the drawer and writes nothing: the prepared plan is already a durable record. */
export const TASK_BAR_SAVE_DRAFT = '保存草稿';
export const TASK_BAR_SAVED = '计划已保存，可稍后开始';
/** AUTH-003 as ADR 0077 revised it: what starting decides, and everything it leaves to the editor. */
export const TASK_BAR_STATEMENT = '只是让 AI7 按这份计划做这一次；接受修改建议、批准受控动作、保存里程碑版本、设为发稿版本都仍由你另行决定';
/** §10: 凭据引用 readiness missing reads 未连接 · 缺少凭据 → 去设置连接, never 设置模型服务. */
export const TASK_BAR_CONNECT = '去设置连接';
/** AUTH-006: a plan whose key content changed offers these two, and no start. */
export const TASK_BAR_RECONFIRM = '重新确认计划';
/** One slot and no queue (S74a A2): the start is refused with this reason and nothing waits for the slot. */
export const TASK_BAR_SLOT_BUSY = '另一项任务正在运行；它结束后再开始';
/** The fallback when a start is refused for a reason the service does not word. */
export const TASK_BAR_START_FAILED = '无法开始这项任务。';
/** J-03's record, as the bar states it once made (§6 AUTH-007: 运行中 / 已记录（不派发）). */
export const TASK_BAR_RECORDED = '已记录（不派发）';
/** §6 离线 (AUTH-002, OFF-004, Issue #502): the deferred start — one activation records the Run, which waits for the network. */
export const TASK_BAR_START_WHEN_ONLINE = '联网后开始任务';
/** §6 离线: the draft action in the words OFF-004 gives it beside 联网后开始任务. Neither of the two is preselected. */
export const TASK_BAR_SAVE_DRAFT_ONLY = '仅保存任务草稿';
/** §6 AUTH-007 `等待网络`（取消）: a waiting Run's one direct control (OFF-010) — nothing ran, so nothing to weigh first. */
export const TASK_BAR_CANCEL_WAIT = '取消';
/** A cancelled wait, as the status line states it: nothing was sent. */
export const TASK_BAR_CANCELLED = '已取消 · 未发送任何内容';
/** The fallback when 取消 is refused for a reason the service does not word. */
export const TASK_BAR_CANCEL_FAILED = '无法取消这项任务。';
/** What a waiting Run needs the editor for (OFF-009): the connection, fixed in 设置 — the one wait with an action beside it. */
export const TASK_BAR_WAITING_FOR_CONNECTION = '需要处理模型连接';
/** The sentence beside a waiting Run: recorded, and it starts by itself once it can — never implying it began (OFF-005). */
export const TASK_BAR_WAITING_NOTE = '已记录这次授权。联网、并确认计划没有变化后会自动开始；在此之前不会发送任何内容';
/** AUTH-010's three controls of a Run under way (Issue #422): 暂停 and 改计划重做 are shown with why they wait. */
export const TASK_BAR_PAUSE = '暂停';
export const TASK_BAR_CANCEL_RUN = '取消任务';
export const TASK_BAR_REDO = '改计划重做';
/** CTRL-004: 取消任务 opens this summary inline, and only its confirmation records anything. */
export const TASK_BAR_CANCEL_IMPACT_HEADING = '取消影响摘要';
export const TASK_BAR_CANCEL_CONFIRM = '确认取消任务';
export const TASK_BAR_CANCEL_KEEP = '继续运行';
/** The fallback when 取消任务 is refused for a reason the service does not word. */
export const TASK_BAR_CANCEL_RUN_FAILED = '无法取消这项任务。';
/** CTRL-005: what 正在取消 says beside itself until the Run has stopped — never a spinner, never 已取消 early. */
export const TASK_BAR_CANCELLING_NOTE = '已记下你的取消；正在进行的这一步完成后停止，此后不会再发送任何内容';
/** 取消任务 of a Run nothing was running — one waiting in the queue, or one AI7 left behind when it closed — settles at once. */
export const TASK_BAR_CANCELLED_NOTE = '已取消这项任务；此后不会再发送任何内容';
/** CTRL-001: what 正在暂停 says until the Run has reached its boundary — never 已暂停 early. */
export const TASK_BAR_PAUSING_NOTE = '已记下你的暂停；正在进行的这一步完成后停下，已完成的部分都会保存';
/** CONT-015: 续行 continues the same Run from where it stopped, under its own authorization. */
export const TASK_BAR_RESUME = '续行';
/** The fallbacks when 暂停 or 续行 is refused for a reason the service does not word. */
export const TASK_BAR_PAUSE_FAILED = '无法暂停这项任务。';
export const TASK_BAR_RESUME_FAILED = '无法续行这项任务。';

/** A stopped Run's continuation point, as the bar states it beside 续行; `null` when its kept progress no longer reads back. */
export function taskBarContinuationNote(unitsSettled: number | null, unitsTotal: number): string {
  if (unitsSettled === null) return '已保存的阅读进度无法核对，这次运行不能续行；可以取消它，再重新开始';
  return unitsSettled >= unitsTotal
    ? `已读完全部 ${unitsTotal} 个阅读范围，结果都已保存；续行时接着做之后的归纳与抽样`
    : `已读完 ${unitsSettled} / ${unitsTotal} 个阅读范围，结果都已保存；续行时从第 ${unitsSettled + 1} 个接着读，不重复已读完的部分`;
}

/** A Review Run cannot wait yet (Issue #502): offline, its start is shown disabled with this reason. */
export const TASK_BAR_REVIEW_OFFLINE = '离线：审阅要连到模型服务，而这台设备现在没有网络；联网后再开始审阅';

/**
 * The one sentence a pre-start state adds beside the actions: J-03's fixed Task is only ever recorded (ADR
 * 0055); a plan without a route is recorded and blocked before dispatch; a route whose model service is not
 * connected cannot start (MODEL-008) — which is the Run's blocker, never a change to the plan (OFF-009).
 */
export const TASK_BAR_NOTES = {
  'record-only': '此任务只记录运行，不会派发',
  'no-route': '这份计划没有可执行的路由：开始任务只记录运行，派发前会被阻止',
  'needs-connection': '模型未连接：这份计划要发送到模型服务，所需的凭据还没有就绪；连接好之后才能开始',
  offline: '离线：这份计划要连到模型服务，而这台设备现在没有网络。联网后开始任务会先记录这次授权，联网后自动开始；在此之前不会发送任何内容',
} as const satisfies Partial<Record<TaskPlanStartReadiness, string>>;

/** What each kind leaves behind, as the summary line names it (§6: 产出). */
export const TASK_BAR_OUTCOMES: Readonly<Record<TaskPlanKind, string>> = {
  'fixed-task': '一条运行记录（不派发）',
  'baseline-analysis': '一份基线分析',
  'review-run': '审阅发现与审阅报告',
};

/** Where each kind's Run is followed once it started (AUTH-007): the record's card, ②A or ②B. */
export const TASK_BAR_RUN_LINKS: Readonly<Record<TaskPlanKind, string>> = {
  'fixed-task': '查看运行记录',
  'baseline-analysis': '查看运行',
  'review-run': '查看审阅',
};

/** The bar's actions, each by the `data-task-drawer-control` it carries. */
export type TaskBarActionName =
  | 'start'
  | 'start-when-online'
  | 'reconfirm-plan'
  | 'view-plan-revision'
  | 'connect'
  | 'revise'
  | 'save-draft'
  | 'update-plan'
  | 'discard-edits'
  | 'cancel-wait'
  | 'pause'
  | 'resume'
  | 'cancel-run'
  | 'redo'
  | 'run-link';

export interface TaskBarAction {
  readonly name: TaskBarActionName;
  readonly label: string;
  readonly tone: 'primary' | 'secondary' | 'quiet';
  /** Why the action is shown and not available, in words beside it; `null` while it is available. */
  readonly disabledReason: string | null;
}

/** The whole bar of one plan as data, so every state is pinned without a DOM. */
export interface TaskBarView {
  readonly readiness: TaskPlanStartReadiness;
  /** AUTH-001's one line: 书 · 范围 · 计划版本 · 模型角色 · 预算上限 · 产出 · 不改稿. */
  readonly summary: string;
  /** AUTH-003's statement while the Task is still to be started; `null` once it has been. */
  readonly statement: string | null;
  /** The sentence a state adds beside its actions; `null` when it adds none. */
  readonly note: string | null;
  /** Once started, the Run's state in the same region (AUTH-007); `null` before. */
  readonly status: string | null;
  readonly actions: ReadonlyArray<TaskBarAction>;
}

/** AUTH-001 and §6: the bar's one summary line, from the plan it states. */
export function taskBarSummary(plan: TaskPlanProjection): string {
  return [
    `《${plan.goal.chips.book}》`,
    plan.goal.chips.position,
    ...(plan.planVersion === null ? [] : [`计划版本 ${plan.planVersion}`]),
    plan.service.role,
    plan.service.budgetCeiling,
    `产出：${TASK_BAR_OUTCOMES[plan.kind]}`,
    '不改稿',
  ].join(' · ');
}

const SAVE_DRAFT: TaskBarAction = { name: 'save-draft', label: TASK_BAR_SAVE_DRAFT, tone: 'secondary', disabledReason: null };

/**
 * What the bar offers for one plan (§6 常驻授权条; AUTH-002, AUTH-006, AUTH-007): `开始任务` while the plan can
 * be started — disabled with its reason while the model is not connected, beside `去设置连接`; never while the
 * key content changed, when `重新确认计划` and `查看计划修订` take its place; and once started, the Run's state
 * and the way to its surface instead of any action that starts it again.
 */
export function taskBarView(plan: TaskPlanProjection, pendingEdits = 0): TaskBarView {
  const readiness = plan.start.readiness;
  const summary = taskBarSummary(plan);
  const runLink: TaskBarAction = { name: 'run-link', label: TASK_BAR_RUN_LINKS[plan.kind], tone: 'secondary', disabledReason: null };
  // 返回修改 (Issue #419): into the plan's editing when it takes edits, else why it does not.
  const revise: TaskBarAction = {
    name: 'revise',
    label: TASK_BAR_REVISE,
    tone: 'quiet',
    disabledReason: plan.edit.editable ? null : plan.edit.reason ?? TASK_BAR_REVISE_REASON,
  };
  // PLAN-011: edits the editor has not yet made the plan put 更新计划 where the start was, beside 撤销修改, and hold
  // the draft back. With a key-content change pending, 重新确认计划 comes first and the edits wait for its version.
  if (readiness !== 'started' && pendingEdits > 0) {
    const drifted = readiness === 'changed';
    return {
      readiness,
      summary,
      statement: null,
      note: drifted ? taskPlanEditCountAfterDrift(pendingEdits) : taskPlanEditCount(pendingEdits),
      status: null,
      actions: [
        ...(drifted && plan.start.reconfirm !== null ? [{ name: 'reconfirm-plan', label: TASK_BAR_RECONFIRM, tone: 'primary', disabledReason: null } as const] : []),
        ...(drifted && plan.drift !== null && plan.drift.entries.length > 0
          ? [{ name: 'view-plan-revision', label: TASK_PLAN_DRIFT_VIEW, tone: 'secondary', disabledReason: null } as const]
          : []),
        {
          name: 'update-plan',
          label: TASK_BAR_UPDATE_PLAN,
          tone: drifted ? 'secondary' : 'primary',
          disabledReason: plan.edit.editable ? null : plan.edit.reason ?? TASK_BAR_REVISE_REASON,
        },
        { name: 'discard-edits', label: TASK_BAR_DISCARD_EDITS, tone: 'secondary', disabledReason: null },
        { name: 'save-draft', label: TASK_BAR_SAVE_DRAFT, tone: 'secondary', disabledReason: TASK_BAR_SAVE_DRAFT_EDITING_REASON },
      ],
    };
  }
  if (readiness === 'started') {
    // A Run in Connectivity Wait (Issue #502; AUTH-007, OFF-006): what it waits for, cancelled directly, and the
    // connection setting beside it when the connection is what it waits for (OFF-009).
    if (plan.state.key === 'waiting') {
      return {
        readiness,
        summary,
        statement: null,
        note: TASK_BAR_WAITING_NOTE,
        status: plan.state.label,
        actions: [
          ...(plan.state.label === TASK_BAR_WAITING_FOR_CONNECTION
            ? [{ name: 'connect', label: TASK_BAR_CONNECT, tone: 'secondary', disabledReason: null } as const]
            : []),
          { name: 'cancel-wait', label: TASK_BAR_CANCEL_WAIT, tone: 'secondary', disabledReason: null },
          runLink,
        ],
      };
    }
    // A Run under way (Issue #422; AUTH-010, CTRL-004, CTRL-005): 暂停 and 改计划重做 with why they wait, 取消任务 — which
    // opens the Cancellation Impact Summary and records nothing — and, once confirmed, 正在取消 and nothing else.
    const control = plan.runControl;
    if (control !== null) {
      if (control.cancelling) {
        return { readiness, summary, statement: null, note: TASK_BAR_CANCELLING_NOTE, status: plan.state.label, actions: [runLink] };
      }
      if (control.pausing) {
        return { readiness, summary, statement: null, note: TASK_BAR_PAUSING_NOTE, status: plan.state.label, actions: [runLink] };
      }
      // A stopped Run — 已暂停, or 任务已中断 · 可续行 (CONT-014, CONT-015): 续行 when its revalidation holds, else why not;
      // 取消任务, whose summary says what it kept; and the way to the Run.
      if (control.resume !== null) {
        const continuation = control.continuation;
        return {
          readiness,
          summary,
          statement: null,
          note: continuation === null ? null : taskBarContinuationNote(continuation.unitsSettled, continuation.unitsTotal),
          status: plan.state.label,
          actions: [
            { name: 'resume', label: TASK_BAR_RESUME, tone: 'primary', disabledReason: control.resume.reason },
            { name: 'cancel-run', label: TASK_BAR_CANCEL_RUN, tone: 'secondary', disabledReason: control.cancel.reason },
            { name: 'redo', label: TASK_BAR_REDO, tone: 'quiet', disabledReason: control.redo.reason },
            runLink,
          ],
        };
      }
      return {
        readiness,
        summary,
        statement: null,
        note: null,
        status: plan.state.label,
        actions: [
          { name: 'pause', label: TASK_BAR_PAUSE, tone: 'secondary', disabledReason: control.pause.reason },
          { name: 'cancel-run', label: TASK_BAR_CANCEL_RUN, tone: 'secondary', disabledReason: control.cancel.reason },
          { name: 'redo', label: TASK_BAR_REDO, tone: 'quiet', disabledReason: control.redo.reason },
          runLink,
        ],
      };
    }
    return {
      readiness,
      summary,
      statement: null,
      note: null,
      status: plan.state.key === 'recorded' ? TASK_BAR_RECORDED : plan.state.key === 'cancelled' ? TASK_BAR_CANCELLED : plan.state.label,
      actions: [runLink],
    };
  }
  if (readiness === 'offline') {
    // 离线 (§6; AUTH-002, OFF-004): the one start this state offers records the Run and it waits; the draft
    // action sits beside it in OFF-004's words, and neither is preselected. A Review Run cannot wait yet.
    if (plan.kind === 'review-run') {
      return {
        readiness,
        summary,
        statement: TASK_BAR_STATEMENT,
        note: TASK_BAR_REVIEW_OFFLINE,
        status: null,
        actions: [{ name: 'start', label: TASK_BAR_START, tone: 'primary', disabledReason: TASK_BAR_REVIEW_OFFLINE }, revise, SAVE_DRAFT],
      };
    }
    return {
      readiness,
      summary,
      statement: TASK_BAR_STATEMENT,
      note: TASK_BAR_NOTES.offline,
      status: null,
      actions: [
        { name: 'start-when-online', label: TASK_BAR_START_WHEN_ONLINE, tone: 'primary', disabledReason: null },
        { name: 'save-draft', label: TASK_BAR_SAVE_DRAFT_ONLY, tone: 'secondary', disabledReason: null },
        revise,
      ],
    };
  }
  if (readiness === 'changed') {
    return {
      readiness,
      summary,
      statement: TASK_BAR_STATEMENT,
      note: plan.drift?.resolution ?? TASK_PLAN_DRIFT_HEADING,
      status: null,
      actions: [
        ...(plan.start.reconfirm === null ? [] : [{ name: 'reconfirm-plan', label: TASK_BAR_RECONFIRM, tone: 'primary', disabledReason: null } as const]),
        ...(plan.drift === null || plan.drift.entries.length === 0 ? [] : [{ name: 'view-plan-revision', label: TASK_PLAN_DRIFT_VIEW, tone: 'secondary', disabledReason: null } as const]),
        revise,
        SAVE_DRAFT,
      ],
    };
  }
  if (readiness === 'needs-connection') {
    const note = TASK_BAR_NOTES['needs-connection'];
    return {
      readiness,
      summary,
      statement: TASK_BAR_STATEMENT,
      note,
      status: null,
      actions: [
        { name: 'start', label: TASK_BAR_START, tone: 'primary', disabledReason: note },
        { name: 'connect', label: TASK_BAR_CONNECT, tone: 'secondary', disabledReason: null },
        revise,
        SAVE_DRAFT,
      ],
    };
  }
  return {
    readiness,
    summary,
    statement: TASK_BAR_STATEMENT,
    note: readiness === 'ready' ? null : TASK_BAR_NOTES[readiness],
    status: null,
    actions: [{ name: 'start', label: TASK_BAR_START, tone: 'primary', disabledReason: null }, revise, SAVE_DRAFT],
  };
}

// ---- the activity card (Issue #422, AUTH-011) -----------------------------------------------------------------

export const TASK_PLAN_ACTIVITY_TITLE = '运行动态';
/** A Run no execution of this service holds: AI7 closed while it ran, so nothing reports where it is. */
export const TASK_PLAN_ACTIVITY_UNREPORTED = '这项任务现在没有在运行：AI7 上次关闭时它没有结束。可以取消它，再准备新的任务。';
/** LIVE-003's words, kept as they are (ADR 0077): over this Run's own bar, the step says so and claims nothing more. */
export const TASK_PLAN_ACTIVITY_STALE = '本步骤用时已超过通常水平';

/**
 * AUTH-011's rows, from the Run Liveness Signal the execution owner reports: the editorial phase, the current object,
 * the time on this step and since the Run began, the attempt's state, the last update, and the milestones reached.
 * Elapsed time is computed from the shown instants at `nowMs`, never estimated; nothing here is a percentage.
 */
export function taskPlanActivityRows(
  activity: NonNullable<TaskPlanRunControlProjection['activity']>,
  executingSince: string | null,
  nowMs: number,
  update: TaskPlanRunControlProjection['update'] = null,
): ReadonlyArray<readonly [string, string]> {
  const stepMs = activity.currentUnitStartedAt === null ? null : nowMs - Date.parse(activity.currentUnitStartedAt);
  // An update Run names its range among the whole manuscript, and counts only the ranges it reads again, as ②A does.
  const current = activity.stage !== 'units'
    ? RUN_LIVENESS_STAGE_LABELS[activity.stage]
    : activity.currentUnitOrdinal === null
      ? '两个阅读范围之间'
      : update === null
        ? `第 ${activity.currentUnitOrdinal} 个阅读范围（共 ${activity.unitsTotal} 个）`
        : `第 ${activity.currentUnitOrdinal} 个阅读范围（全书共 ${update.manuscriptUnits} 个，这次重新分析 ${activity.unitsTotal} 个）`;
  return [
    ['阶段', RUN_LIVENESS_STAGE_LABELS[activity.stage]],
    ['当前', current],
    ['用时', [
      ...(stepMs === null ? [] : [`本步 ${elapsedLabel(stepMs)}`]),
      ...(executingSince === null ? [] : [`运行 ${elapsedLabel(nowMs - Date.parse(executingSince))}`]),
    ].join(' · ') || '—'],
    ['尝试', activity.attemptState === null ? '—' : attemptStateLabel(activity.attemptState)],
    ['上次更新', localInstantLabel(activity.lastTransitionAt)],
    ['进展', `已读完 ${activity.unitsSettled} / ${activity.unitsTotal} 个阅读范围${update === null ? '' : '（只算要重新分析的）'} · 已完成模型回合 ${activity.completedAttempts} 次`],
  ];
}

/** Whether the step in flight has run longer than this Run can account for (LIVE-003), as ②A judges it. */
export function taskPlanActivityIsStale(activity: NonNullable<TaskPlanRunControlProjection['activity']>, nowMs: number): boolean {
  return activity.currentUnitStartedAt !== null && runStepIsStale(nowMs - Date.parse(activity.currentUnitStartedAt), activity.longestSettledUnitMs);
}

// ---- the surfaces that raise a Task (S72 D4) ---------------------------------------------------------------

/** The one line a surface keeps where its inline plan used to be; the plan itself opens in the drawer. */
export function taskPlanSummaryLine(parts: ReadonlyArray<string>): string {
  return `计划：${parts.filter((part) => part.length > 0).join(' · ')}`;
}
