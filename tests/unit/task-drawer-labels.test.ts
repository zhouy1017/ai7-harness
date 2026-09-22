import { describe, expect, it } from 'vitest';
import type { TaskPlanProjection, TaskPlanStateKey } from '../../src/shared/protocol.js';
import {
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
  TASK_PLAN_EDIT_REASON,
  TASK_PLAN_FULL_LINK,
  TASK_PLAN_MATERIALITY_LABELS,
  TASK_PLAN_OPEN,
  TASK_PLAN_SCOPE_TERMS,
  TASK_PLAN_SECTIONS,
  TASK_PLAN_SERVICE_TERMS,
  TASK_PLAN_STATE_PILLS,
  groupedCount,
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
    ...overrides,
  };
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
    const keys: TaskPlanStateKey[] = ['ready', 'changed', 'recorded', 'blocked', 'running', 'settled', 'stopped'];
    expect(Object.keys(TASK_PLAN_STATE_PILLS).sort()).toEqual([...keys].sort());
    expect(new Set(keys.map((key) => TASK_PLAN_STATE_PILLS[key].shape)).size).toBeGreaterThan(4);
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
});
