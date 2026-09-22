import type { TaskPlanKind, TaskPlanProjection, TaskPlanStartReadiness, TaskPlanStateKey } from '../shared/protocol.js';
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
};

// ---- the goal block (S72 D5) ------------------------------------------------------------------------------

/** 修改 returns to the composer with the plan editing of S73; until then it is shown with this reason. */
export const TASK_PLAN_EDIT = '修改';
export const TASK_PLAN_EDIT_REASON = '随计划编辑提供';

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
/** `设为快速开始默认…` is its own action (AUTH-009, TASK-019); the rule it sets arrives with S75. */
export const TASK_PLAN_DEFAULT_RULE = '设为快速开始默认…';
export const TASK_PLAN_DEFAULT_RULE_REASON = '快速开始默认规则随「知识库 › 工序与规则」提供。';
/** The heading of the engineer's 不会做 inside 查看技术详情 (editor-surfaces §10). */
export const TASK_PLAN_TECHNICAL_NOT_DO = '技术性的不会做';

// ---- the plan's key content changed (S72 D8) --------------------------------------------------------------

export const TASK_PLAN_DRIFT_HEADING = '计划的关键内容已变化';
export const TASK_PLAN_DRIFT_VIEW = '查看计划修订';
export const TASK_PLAN_DRIFT_COLUMNS = ['内容', '原计划', '重新确认后', '性质'] as const;
/** §10: 物质字段 / 派生后果 read 关键内容 / 随之变化. */
export const TASK_PLAN_MATERIALITY_LABELS = { material: '关键内容', derived: '随之变化' } as const satisfies Record<'material' | 'derived', string>;

// ---- the authorization bar (Issue #420, S74a; §6 常驻授权条, V2-UX-AUTH-001 to 007, §10) --------------------

/** AUTH-002 as ADR 0077 revised it: the one start action; the word 授权 is never on the button. */
export const TASK_BAR_START = '开始任务';
/** 返回修改 returns to the plan's editing, which arrives with S73; until then it is shown with its reason. */
export const TASK_BAR_REVISE = '返回修改';
export const TASK_BAR_REVISE_REASON = '随计划编辑提供';
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

/**
 * The one sentence a pre-start state adds beside the actions: J-03's fixed Task is only ever recorded (ADR
 * 0055); a plan without a route is recorded and blocked before dispatch; a route whose model service is not
 * connected cannot start (MODEL-008) — which is the Run's blocker, never a change to the plan (OFF-009).
 */
export const TASK_BAR_NOTES = {
  'record-only': '此任务只记录运行，不会派发',
  'no-route': '这份计划没有可执行的路由：开始任务只记录运行，派发前会被阻止',
  'needs-connection': '模型未连接：这份计划要发送到模型服务，所需的凭据还没有就绪；连接好之后才能开始',
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
export type TaskBarActionName = 'start' | 'reconfirm-plan' | 'view-plan-revision' | 'connect' | 'revise' | 'save-draft' | 'run-link';

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

const REVISE: TaskBarAction = { name: 'revise', label: TASK_BAR_REVISE, tone: 'quiet', disabledReason: TASK_BAR_REVISE_REASON };
const SAVE_DRAFT: TaskBarAction = { name: 'save-draft', label: TASK_BAR_SAVE_DRAFT, tone: 'secondary', disabledReason: null };

/**
 * What the bar offers for one plan (§6 常驻授权条; AUTH-002, AUTH-006, AUTH-007): `开始任务` while the plan can
 * be started — disabled with its reason while the model is not connected, beside `去设置连接`; never while the
 * key content changed, when `重新确认计划` and `查看计划修订` take its place; and once started, the Run's state
 * and the way to its surface instead of any action that starts it again.
 */
export function taskBarView(plan: TaskPlanProjection): TaskBarView {
  const readiness = plan.start.readiness;
  const summary = taskBarSummary(plan);
  if (readiness === 'started') {
    return {
      readiness,
      summary,
      statement: null,
      note: null,
      status: plan.state.key === 'recorded' ? TASK_BAR_RECORDED : plan.state.label,
      actions: [{ name: 'run-link', label: TASK_BAR_RUN_LINKS[plan.kind], tone: 'secondary', disabledReason: null }],
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
        REVISE,
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
        REVISE,
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
    actions: [{ name: 'start', label: TASK_BAR_START, tone: 'primary', disabledReason: null }, REVISE, SAVE_DRAFT],
  };
}

// ---- the surfaces that raise a Task (S72 D4) ---------------------------------------------------------------

/** The one line a surface keeps where its inline plan used to be; the plan itself opens in the drawer. */
export function taskPlanSummaryLine(parts: ReadonlyArray<string>): string {
  return `计划：${parts.filter((part) => part.length > 0).join(' · ')}`;
}
