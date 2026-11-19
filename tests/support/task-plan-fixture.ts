import type { TaskPlanProjection } from '../../src/shared/protocol.js';

/** A prepared baseline-analysis plan in synthetic words; a test moves only the facts it is about. */
export function taskPlanFixture(overrides: Partial<TaskPlanProjection> = {}): TaskPlanProjection {
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
    steps: [{ id: 'units', label: '逐章读取', result: '各章摘要', removable: false, removed: false }],
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
    edit: { editable: true, reason: null, lastEdit: null, planEnvelopeDigest: 'a'.repeat(64), budget: { ceiling: 'unset', settable: true, reason: null } },
    drift: null,
    technical: [],
    start: { readiness: 'ready', needsModelConnection: false, planEnvelopeDigest: 'a'.repeat(64), categoryDigests: [], reconfirm: null },
    defaultRule: { canSet: false, reason: '这份计划不能设为快速开始默认。', planEnvelopeDigest: null, current: null, binds: [], startedBy: null },
    runControl: null,
    redo: null,
    resend: null,
    unconfirmed: null,
    reprepare: null,
    clarifications: [],
    budgetStop: null,
    ...overrides,
  };
}
