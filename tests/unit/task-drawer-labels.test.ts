import { describe, expect, it } from 'vitest';
import type { TaskPlanProjection, TaskPlanStartProjection, TaskPlanStateKey } from '../../src/shared/protocol.js';
import {
  TASK_BAR_CANCEL_FAILED,
  TASK_BAR_CANCEL_WAIT,
  TASK_BAR_CANCELLED,
  TASK_BAR_CONNECT,
  TASK_BAR_NOTES,
  TASK_BAR_OUTCOMES,
  TASK_BAR_RECONFIRM,
  TASK_BAR_RECORDED,
  TASK_BAR_REVISE,
  TASK_BAR_REVISE_REASON,
  TASK_BAR_RUN_LINKS,
  TASK_BAR_SAVE_DRAFT,
  TASK_BAR_SAVED,
  TASK_BAR_REVIEW_OFFLINE,
  TASK_BAR_SAVE_DRAFT_ONLY,
  TASK_BAR_SLOT_BUSY,
  TASK_BAR_START,
  TASK_BAR_START_WHEN_ONLINE,
  TASK_BAR_STATEMENT,
  TASK_BAR_WAITING_FOR_CONNECTION,
  TASK_BAR_WAITING_NOTE,
  TASK_DRAWER_BACK,
  TASK_DRAWER_BACK_REASON,
  TASK_DRAWER_FOOTER,
  TASK_DRAWER_MODE_KEY,
  TASK_DRAWER_MODES,
  TASK_DRAWER_SCREENS,
  TASK_DRAWER_TITLE,
  TASK_PLAN_BOUNDARY_COLUMNS,
  TASK_PLAN_CEILING_NOTE,
  TASK_PLAN_COMPACT_TERMS,
  TASK_PLAN_DEFAULT_RULE,
  TASK_PLAN_DRIFT_COLUMNS,
  TASK_PLAN_DRIFT_HEADING,
  TASK_PLAN_DRIFT_VIEW,
  TASK_PLAN_EDIT_REASON,
  TASK_PLAN_FULL_LINK,
  TASK_PLAN_MATERIALITY_LABELS,
  TASK_PLAN_OPEN,
  TASK_PLAN_OPEN_START,
  TASK_PLAN_SCOPE_TERMS,
  TASK_PLAN_SECTIONS,
  TASK_PLAN_SERVICE_TERMS,
  TASK_PLAN_STATE_PILLS,
  groupedCount,
  taskBarSummary,
  taskBarView,
  taskDrawerModeOf,
  taskPlanChips,
  taskPlanCompactRows,
  taskPlanSavedLine,
  taskPlanSummaryLine,
} from '../../src/renderer/task-drawer-labels.js';

// The Task Drawer's own words (Issue #418, plan slice S72; editor-surfaces §6 ③, §10): the header, the two
// modes and the one the drawer opens in, the goal block's chips (D5), the five rows of 精简 and the six
// sections of 完整 (D6), the words §10 fixes for a plan whose key content changed (D8), and the footer
// PLAN-007 fixes. Pure strings, pinned byte for byte.

function plan(overrides: Partial<TaskPlanProjection> = {}): TaskPlanProjection {
  return {
    bookId: 'book',
    kind: 'baseline-analysis',
    ref: 'task',
    state: { key: 'ready', label: '尚未开始' },
    planVersion: 1,
    goal: {
      sentence: '为这本书做基线分析',
      chips: { book: '合成书名', position: '全书', selectedGraphemes: 12345, taskInputRevision: 'r2', procedure: '基线分析' },
      savedForEdits: true,
    },
    scope: { process: '《合成书名》全书 · 12,345 字 · 8 个阅读范围', reference: [], send: '不发送任何内容', notRead: '其他图书' },
    steps: [{ label: '逐章读取', result: '各章摘要' }],
    participation: { during: '预计无需中途参与', after: null },
    service: {
      role: '主编辑角色',
      provider: 'DeepSeek 开放平台 · deepseek-v4-pro',
      decision: '远程模型服务被拒绝',
      send: '本环境不连接模型服务，不会发送任何内容',
      sendCategory: '公开或合成材料',
      usage: '不发送，没有模型用量',
      usageIsCeiling: false,
      duration: '暂无可靠估计',
      budgetCeiling: '未设置任务预算上限',
      accountLimit: '未知 · 提供方未返回',
    },
    outcomes: ['一份基线分析', '这次运行的运行报告'],
    notDo: { editorial: ['不会直接修改稿件', '不导出或发布'], technical: ['不创建或执行 Effect'] },
    boundary: { adaptable: [], askFirst: [] },
    drift: null,
    technical: [],
    start: { readiness: 'ready', needsModelConnection: false, planEnvelopeDigest: 'a'.repeat(64), categoryDigests: [], reconfirm: null },
    defaultRule: { canSet: false, reason: '这份计划不能设为快速开始默认。', current: null, binds: [], startedBy: null },
    ...overrides,
  };
}

/** The same plan with only its bar's facts moved. */
function barOf(start: Partial<TaskPlanStartProjection>, overrides: Partial<TaskPlanProjection> = {}): TaskPlanProjection {
  const base = plan(overrides);
  return { ...base, start: { ...base.start, ...start } };
}

describe('the drawer', () => {
  it('names itself, its header actions and its footer in §6\'s and PLAN-007\'s words', () => {
    expect(TASK_DRAWER_TITLE).toBe('任务计划');
    expect(TASK_DRAWER_BACK).toBe('← 任务');
    expect(TASK_DRAWER_BACK_REASON).toBe('任务面接通后可用');
    expect(TASK_DRAWER_FOOTER).toBe('计划说明，不是运行授权');
    expect(TASK_PLAN_OPEN).toBe('查看计划');
  });

  it('opens in 精简 unless 完整 is what the editor chose last, and never trusts anything else it reads back', () => {
    expect(TASK_DRAWER_MODES).toEqual({ compact: '精简', full: '完整' });
    expect(TASK_DRAWER_MODE_KEY).toBe('ai7.taskDrawer.mode');
    expect(taskDrawerModeOf(null)).toBe('compact');
    expect(taskDrawerModeOf('compact')).toBe('compact');
    expect(taskDrawerModeOf('full')).toBe('full');
    expect(taskDrawerModeOf('FULL')).toBe('compact');
    expect(taskDrawerModeOf('')).toBe('compact');
  });

  it('stays beside the manuscript, 工作概览 (also right after an import), ②A and ②B only (D3)', () => {
    expect(TASK_DRAWER_SCREENS).toEqual(['editor', 'book-overview', 'imported', 'book-analysis', 'book-review']);
  });

  it('gives every state a tone and a shape, so the pill never speaks by colour alone', () => {
    const keys: TaskPlanStateKey[] = [
      'ready', 'changed', 'unconnected', 'offline', 'recorded', 'blocked', 'waiting', 'running', 'settled', 'stopped', 'cancelled',
    ];
    expect(Object.keys(TASK_PLAN_STATE_PILLS).sort()).toEqual([...keys].sort());
    expect(new Set(keys.map((key) => TASK_PLAN_STATE_PILLS[key].shape)).size).toBeGreaterThan(4);
    // 模型未连接 is its own shape among the pre-start states: it never reads as 计划已变化 without colour.
    expect(TASK_PLAN_STATE_PILLS.unconnected.shape).not.toBe(TASK_PLAN_STATE_PILLS.changed.shape);
    expect(TASK_PLAN_STATE_PILLS.unconnected.shape).not.toBe(TASK_PLAN_STATE_PILLS.ready.shape);
    // So is 离线 (Issue #502); a waiting Run never reads as a running one, nor a cancelled one as 已中断 (OFF-012).
    const preStart = (['ready', 'changed', 'unconnected', 'offline'] as const).map((key) => TASK_PLAN_STATE_PILLS[key].shape);
    expect(new Set(preStart).size).toBe(preStart.length);
    expect(TASK_PLAN_STATE_PILLS.waiting.shape).not.toBe(TASK_PLAN_STATE_PILLS.running.shape);
    expect(TASK_PLAN_STATE_PILLS.cancelled.shape).not.toBe(TASK_PLAN_STATE_PILLS.stopped.shape);
  });
});

describe('the goal block (D5)', () => {
  it('lists 书 · 位置 · 已选字数 · 任务输入修订版 · 工序 in order, and leaves out a count no single range has', () => {
    expect(taskPlanChips(plan().goal.chips)).toEqual([
      { key: 'book', text: '合成书名' },
      { key: 'position', text: '全书' },
      { key: 'selected', text: '已选 12,345 字' },
      { key: 'revision', text: '任务输入修订版 r2' },
      { key: 'procedure', text: '工序「基线分析」' },
    ]);
    expect(taskPlanChips({ ...plan().goal.chips, selectedGraphemes: null }).map((chip) => chip.key)).toEqual(['book', 'position', 'revision', 'procedure']);
    expect(groupedCount(1240)).toBe('1,240');
  });

  it('says the saved revision leaves the Task untouched by later editing (TASK-039/040), and why 修改 waits', () => {
    expect(taskPlanSavedLine('r2')).toBe('已为任务保存修订版 r2，之后的编辑不影响这项任务。');
    expect(TASK_PLAN_EDIT_REASON).toBe('随计划编辑提供');
  });
});

describe('精简 and 完整 (D6)', () => {
  it('reads 精简 as the five LAYER-002 rows and the way to the whole plan', () => {
    expect(TASK_PLAN_COMPACT_TERMS).toEqual(['处理', '发送', '会得到', '不会', '中途']);
    expect(TASK_PLAN_FULL_LINK).toBe('完整计划（6 段）');
    expect(taskPlanCompactRows(plan())).toEqual([
      ['处理', '《合成书名》全书 · 12,345 字 · 8 个阅读范围'],
      ['发送', '本环境不连接模型服务，不会发送任何内容 · 用量：不发送，没有模型用量 · 未设置任务预算上限'],
      ['会得到', '一份基线分析；这次运行的运行报告'],
      ['不会', '不会直接修改稿件 · 不导出或发布'],
      ['中途', '预计无需中途参与'],
    ]);
  });

  it('labels a usage ceiling as a ceiling, never a prediction, and names what is referred to and what follows the Run', () => {
    const live = plan({
      scope: { ...plan().scope, reference: ['上一份基线分析（第 1 份，读的是 r1）'] },
      service: { ...plan().service, usage: '至多 240,000 tokens（8 个阅读范围）', usageIsCeiling: true, budgetCeiling: '任务运行预算上限：240,000 tokens' },
      participation: { during: '预计无需中途参与', after: '每一类完成后，它的发现立即可以处理' },
    });
    const rows = Object.fromEntries(taskPlanCompactRows(live));
    expect(rows['处理']).toBe('《合成书名》全书 · 12,345 字 · 8 个阅读范围；参考 上一份基线分析（第 1 份，读的是 r1）');
    expect(rows['发送']).toBe(`本环境不连接模型服务，不会发送任何内容 · 用量：至多 240,000 tokens（8 个阅读范围）（${TASK_PLAN_CEILING_NOTE}） · 任务运行预算上限：240,000 tokens`);
    expect(TASK_PLAN_CEILING_NOTE).toBe('上限，不是预测');
    expect(rows['中途']).toBe('预计无需中途参与；结束后：每一类完成后，它的发现立即可以处理');
  });

  it('names 完整\'s six sections, TASK-030\'s separate regions, and PLAN-012\'s two columns', () => {
    expect(TASK_PLAN_SECTIONS).toEqual(['要做什么 · 会得到什么', '处理哪些内容 · 参考什么', '怎么做', '你会参与的地方', '预计与限制', '会得到 / 不会做']);
    expect(TASK_PLAN_SCOPE_TERMS).toEqual(['要处理', '允许参考', '可能发送', '不会读']);
    expect(TASK_PLAN_SERVICE_TERMS).toEqual(['模型角色', '提供方', '提供方状态', '会发送', '发送内容类别', '用量上限', '所需时间', '预算上限', '账户限额']);
    expect(TASK_PLAN_BOUNDARY_COLUMNS).toEqual(['运行中 AI7 可以自己调整', '这些一变就先停下来问你']);
    expect(TASK_PLAN_DEFAULT_RULE).toBe('设为快速开始默认…');
  });
});

describe('a plan whose key content changed (D8) and the surfaces that raise a Task (D4)', () => {
  it('reads the diff in §10\'s words', () => {
    expect(TASK_PLAN_DRIFT_HEADING).toBe('计划的关键内容已变化');
    expect(TASK_PLAN_DRIFT_COLUMNS).toEqual(['内容', '原计划', '重新确认后', '性质']);
    expect(TASK_PLAN_MATERIALITY_LABELS).toEqual({ material: '关键内容', derived: '随之变化' });
  });

  it('names a plan in one line, leaving out an empty part', () => {
    expect(taskPlanSummaryLine(['固定任务', '全书', '任务输入修订版 r2', '不发送任何内容'])).toBe('计划：固定任务 · 全书 · 任务输入修订版 r2 · 不发送任何内容');
    expect(taskPlanSummaryLine(['首次基线分析', '全书', ''])).toBe('计划：首次基线分析 · 全书');
  });

  it('names the card\'s one action 查看计划并开始 while the Task has not been started (S74a A5)', () => {
    expect(TASK_PLAN_OPEN_START).toBe('查看计划并开始');
  });
});

// Issue #420 (plan slice S74a): the authorization bar in the drawer's footer (§6 常驻授权条; V2-UX-AUTH-001 to
// 007, MODEL-008, OFF-009, ADR 0055). Every state is pinned as data: its summary, its statement, its note and
// which actions it offers, each with its reason when it is shown and unavailable.
describe('the authorization bar (S74a)', () => {
  const names = (view: ReturnType<typeof taskBarView>): string[] => view.actions.map((action) => action.name);
  const action = (view: ReturnType<typeof taskBarView>, name: string) => view.actions.find((entry) => entry.name === name);

  it('speaks §6\'s and ADR 0077\'s words: 开始任务 without 授权, the statement, 去设置连接, and the one-slot refusal', () => {
    expect(TASK_BAR_START).toBe('开始任务');
    expect(TASK_BAR_START).not.toContain('授权');
    expect(TASK_BAR_REVISE).toBe('返回修改');
    expect(TASK_BAR_REVISE_REASON).toBe('随计划编辑提供');
    expect(TASK_BAR_SAVE_DRAFT).toBe('保存草稿');
    expect(TASK_BAR_SAVED).toBe('计划已保存，可稍后开始');
    expect(TASK_BAR_STATEMENT).toBe('只是让 AI7 按这份计划做这一次；接受修改建议、批准受控动作、保存里程碑版本、设为发稿版本都仍由你另行决定');
    expect(TASK_BAR_CONNECT).toBe('去设置连接');
    expect(TASK_BAR_RECONFIRM).toBe('重新确认计划');
    expect(TASK_BAR_SLOT_BUSY).toBe('另一项任务正在运行；它结束后再开始');
    expect(TASK_BAR_RECORDED).toBe('已记录（不派发）');
    expect(TASK_BAR_NOTES).toEqual({
      'record-only': '此任务只记录运行，不会派发',
      'no-route': '这份计划没有可执行的路由：开始任务只记录运行，派发前会被阻止',
      'needs-connection': '模型未连接：这份计划要发送到模型服务，所需的凭据还没有就绪；连接好之后才能开始',
      offline: '离线：这份计划要连到模型服务，而这台设备现在没有网络。联网后开始任务会先记录这次授权，联网后自动开始；在此之前不会发送任何内容',
    });
    expect(TASK_BAR_OUTCOMES).toEqual({ 'fixed-task': '一条运行记录（不派发）', 'baseline-analysis': '一份基线分析', 'review-run': '审阅发现与审阅报告' });
    expect(TASK_BAR_RUN_LINKS).toEqual({ 'fixed-task': '查看运行记录', 'baseline-analysis': '查看运行', 'review-run': '查看审阅' });
  });

  it('sums the plan up in one line: 书 · 范围 · 计划版本 · 模型角色 · 预算上限 · 产出 · 不改稿 (AUTH-001)', () => {
    expect(taskBarSummary(plan())).toBe('《合成书名》 · 全书 · 计划版本 1 · 主编辑角色 · 未设置任务预算上限 · 产出：一份基线分析 · 不改稿');
    // A kind that keeps no plan versions names none rather than inventing one.
    expect(taskBarSummary(plan({ kind: 'fixed-task', planVersion: null }))).toBe('《合成书名》 · 全书 · 主编辑角色 · 未设置任务预算上限 · 产出：一条运行记录（不派发） · 不改稿');
    expect(taskBarSummary(plan({ kind: 'review-run', planVersion: null, goal: { ...plan().goal, chips: { ...plan().goal.chips, position: '「第一章」至「第三章」' } } })))
      .toBe('《合成书名》 · 「第一章」至「第三章」 · 主编辑角色 · 未设置任务预算上限 · 产出：审阅发现与审阅报告 · 不改稿');
  });

  it('offers 开始任务, 返回修改 with its reason and 保存草稿 while the plan can start (AUTH-002)', () => {
    const view = taskBarView(plan());
    expect(view).toMatchObject({ readiness: 'ready', statement: TASK_BAR_STATEMENT, note: null, status: null });
    expect(names(view)).toEqual(['start', 'revise', 'save-draft']);
    expect(action(view, 'start')).toEqual({ name: 'start', label: '开始任务', tone: 'primary', disabledReason: null });
    expect(action(view, 'revise')?.disabledReason).toBe('随计划编辑提供');
    expect(action(view, 'save-draft')?.disabledReason).toBeNull();
  });

  it('says J-03\'s Task is only recorded, and a plan without a route is blocked before dispatch, beside the same start (ADR 0055)', () => {
    const recordOnly = taskBarView(barOf({ readiness: 'record-only' }, { kind: 'fixed-task', planVersion: null }));
    expect(recordOnly.note).toBe('此任务只记录运行，不会派发');
    expect(names(recordOnly)).toEqual(['start', 'revise', 'save-draft']);
    expect(action(recordOnly, 'start')?.disabledReason).toBeNull();
    const noRoute = taskBarView(barOf({ readiness: 'no-route' }));
    expect(noRoute.note).toBe(TASK_BAR_NOTES['no-route']);
    expect(action(noRoute, 'start')?.disabledReason).toBeNull();
  });

  it('keeps 开始任务 disabled with the reason and offers 去设置连接 while the model is not connected (MODEL-008)', () => {
    const view = taskBarView(barOf({ readiness: 'needs-connection', needsModelConnection: true, planEnvelopeDigest: null }, { state: { key: 'unconnected', label: '模型未连接' } }));
    expect(names(view)).toEqual(['start', 'connect', 'revise', 'save-draft']);
    expect(action(view, 'start')?.disabledReason).toBe(TASK_BAR_NOTES['needs-connection']);
    expect(action(view, 'connect')).toEqual({ name: 'connect', label: '去设置连接', tone: 'secondary', disabledReason: null });
    expect(view.note).toBe(TASK_BAR_NOTES['needs-connection']);
  });

  it('removes 开始任务 from a changed plan, offering 重新确认计划 when it can be and 查看计划修订 when there is a diff (AUTH-006)', () => {
    const drift = { reasons: ['计划冻结之后，它的关键内容已经变化；原计划不能再开始。'], entries: [{ field: 'selectedRange', label: '处理范围', prior: '第 1–2 段 · 10 字', proposed: '第 3–4 段 · 20 字', materiality: 'material' as const }], resolution: '重新确认计划后，新的计划版本才能开始。' };
    const reconfirmable = taskBarView(barOf({ readiness: 'changed', planEnvelopeDigest: null, reconfirm: { goal: '重新分析所选范围：绕过所选内容块范围及其重叠闭包的既有模型结果，复用其余兼容单元，追加一个结果集修订版。', update: { mode: 'reanalyze-range', selectedRange: { startPosition: 3, endPosition: 4 } } } }, { drift }));
    expect(names(reconfirmable)).toEqual(['reconfirm-plan', 'view-plan-revision', 'revise', 'save-draft']);
    expect(action(reconfirmable, 'reconfirm-plan')?.label).toBe('重新确认计划');
    expect(action(reconfirmable, 'view-plan-revision')?.label).toBe(TASK_PLAN_DRIFT_VIEW);
    expect(reconfirmable.note).toBe('重新确认计划后，新的计划版本才能开始。');
    // A Review Run has no revision route, and its reasons carry no diff: neither action is offered.
    const review = taskBarView(barOf({ readiness: 'changed', planEnvelopeDigest: null }, { kind: 'review-run', drift: { reasons: ['这次审阅的计划已被之后准备的一次取代；请授权最新的一次。'], entries: [], resolution: '审阅没有计划修订：请在「审阅」里点「返回修改」重新准备这次审阅。' } }));
    expect(names(review)).toEqual(['revise', 'save-draft']);
    expect(review.note).toBe('审阅没有计划修订：请在「审阅」里点「返回修改」重新准备这次审阅。');
    for (const view of [reconfirmable, review]) expect(names(view)).not.toContain('start');
  });

  it('speaks §6\'s words for 离线 and the wait (Issue #502): 联网后开始任务 without 授权, 仅保存任务草稿, and 取消', () => {
    expect(TASK_BAR_START_WHEN_ONLINE).toBe('联网后开始任务');
    expect(TASK_BAR_START_WHEN_ONLINE).not.toContain('授权');
    expect(TASK_BAR_SAVE_DRAFT_ONLY).toBe('仅保存任务草稿');
    expect(TASK_BAR_CANCEL_WAIT).toBe('取消');
    expect(TASK_BAR_CANCELLED).toBe('已取消 · 未发送任何内容');
    expect(TASK_BAR_CANCEL_FAILED).toBe('无法取消这项任务。');
    expect(TASK_BAR_WAITING_FOR_CONNECTION).toBe('需要处理模型连接');
    expect(TASK_BAR_WAITING_NOTE).toBe('已记录这次授权。联网、并确认计划没有变化后会自动开始；在此之前不会发送任何内容');
    expect(TASK_BAR_REVIEW_OFFLINE).toBe('离线：审阅要连到模型服务，而这台设备现在没有网络；联网后再开始审阅');
  });

  it('offers 联网后开始任务 beside 仅保存任务草稿 while offline, and no 开始任务 to confuse it with (AUTH-002, OFF-004)', () => {
    const view = taskBarView(barOf({ readiness: 'offline' }, { state: { key: 'offline', label: '离线' } }));
    expect(view).toMatchObject({ readiness: 'offline', statement: TASK_BAR_STATEMENT, note: TASK_BAR_NOTES.offline, status: null });
    expect(names(view)).toEqual(['start-when-online', 'save-draft', 'revise']);
    expect(action(view, 'start-when-online')).toEqual({ name: 'start-when-online', label: '联网后开始任务', tone: 'primary', disabledReason: null });
    // The draft action in OFF-004's words; it still only closes the drawer, so it is the same control.
    expect(action(view, 'save-draft')).toEqual({ name: 'save-draft', label: '仅保存任务草稿', tone: 'secondary', disabledReason: null });
    expect(names(view)).not.toContain('start');
    for (const entry of view.actions) expect(entry.label).not.toContain('授权');
  });

  it('keeps a Review Run from starting while offline, with the reason, because it cannot wait yet', () => {
    const view = taskBarView(barOf(
      { readiness: 'offline', planEnvelopeDigest: null, categoryDigests: [{ categoryId: 'consistency', planEnvelopeDigest: 'd'.repeat(64) }] },
      { kind: 'review-run', planVersion: null, state: { key: 'offline', label: '离线' } },
    ));
    expect(names(view)).toEqual(['start', 'revise', 'save-draft']);
    expect(action(view, 'start')?.disabledReason).toBe(TASK_BAR_REVIEW_OFFLINE);
    expect(view.note).toBe(TASK_BAR_REVIEW_OFFLINE);
    expect(names(view)).not.toContain('start-when-online');
  });

  it('shows what a waiting Run waits for, its direct 取消, and 去设置连接 only when the connection is what it waits for (AUTH-007, OFF-006, OFF-009, OFF-010)', () => {
    const started = { readiness: 'started' as const, planEnvelopeDigest: null };
    const network = taskBarView(barOf(started, { state: { key: 'waiting', label: '等待网络' } }));
    expect(network).toMatchObject({ readiness: 'started', statement: null, note: TASK_BAR_WAITING_NOTE, status: '等待网络' });
    expect(names(network)).toEqual(['cancel-wait', 'run-link']);
    expect(action(network, 'cancel-wait')).toEqual({ name: 'cancel-wait', label: '取消', tone: 'secondary', disabledReason: null });
    const connection = taskBarView(barOf(started, { state: { key: 'waiting', label: TASK_BAR_WAITING_FOR_CONNECTION } }));
    expect(names(connection)).toEqual(['connect', 'cancel-wait', 'run-link']);
    expect(action(connection, 'connect')?.label).toBe('去设置连接');
    for (const label of ['等待运行名额', '正在排队']) {
      const view = taskBarView(barOf(started, { state: { key: 'waiting', label } }));
      expect(view.status).toBe(label);
      expect(names(view)).toEqual(['cancel-wait', 'run-link']);
    }
  });

  it('states a cancelled wait as cancelled with nothing sent — never as 已中断 — and only links to it (OFF-010, OFF-012)', () => {
    const cancelled = taskBarView(barOf({ readiness: 'started', planEnvelopeDigest: null }, { state: { key: 'cancelled', label: '已取消' } }));
    expect(cancelled).toMatchObject({ statement: null, note: null, status: '已取消 · 未发送任何内容' });
    expect(names(cancelled)).toEqual(['run-link']);
  });

  it('becomes the Run\'s state and the way to its surface once started, offering nothing that would start it again (AUTH-007)', () => {
    const recorded = taskBarView(barOf({ readiness: 'started', planEnvelopeDigest: null }, { kind: 'fixed-task', planVersion: null, state: { key: 'recorded', label: '已记录 · 未派发' } }));
    expect(recorded).toMatchObject({ readiness: 'started', statement: null, note: null, status: '已记录（不派发）' });
    expect(recorded.actions).toEqual([{ name: 'run-link', label: '查看运行记录', tone: 'secondary', disabledReason: null }]);
    const running = taskBarView(barOf({ readiness: 'started', planEnvelopeDigest: null }, { state: { key: 'running', label: '运行中' } }));
    expect(running.status).toBe('运行中');
    expect(names(running)).toEqual(['run-link']);
    expect(action(running, 'run-link')?.label).toBe('查看运行');
    const review = taskBarView(barOf({ readiness: 'started', planEnvelopeDigest: null }, { kind: 'review-run', state: { key: 'settled', label: '已完成' } }));
    expect(review.status).toBe('已完成');
    expect(action(review, 'run-link')?.label).toBe('查看审阅');
  });
});
