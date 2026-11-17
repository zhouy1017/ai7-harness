import type { TaskPlanProjection, TaskPlanStartProjection } from '../../src/shared/protocol.js';
import { ACCOUNT_LIMIT_UNKNOWN, LOCKED_BOUNDARY } from '../../src/service/task-plan.js';

export function planWith(start: Partial<TaskPlanStartProjection>): TaskPlanProjection {
  return {
    bookId: 'book',
    kind: 'baseline-analysis',
    ref: 'task',
    state: { key: 'ready', label: '尚未开始' },
    planVersion: 1,
    goal: { sentence: '为这本书做基线分析', chips: { book: '合成书名', position: '全书', selectedGraphemes: 10, taskInputRevision: 'r1', procedure: '基线分析' }, savedForEdits: false },
    scope: { process: '《合成书名》全书', reference: [], send: '所读阅读范围的稿件正文（8 个）', notRead: '其他图书' },
    steps: [],
    participation: { during: '预计无需中途参与', after: null },
    service: { role: '主编辑角色', provider: 'opencode-go · deepseek-v4.1-flash', decision: '开发者实时', send: '发往 opencode-go', sendCategory: '公开或合成材料', usage: '至多 240,000 tokens（8 个阅读范围）', usageIsCeiling: true, duration: '暂无可靠估计', budgetCeiling: '任务运行预算上限：240,000 tokens', accountLimit: ACCOUNT_LIMIT_UNKNOWN },
    outcomes: ['一份基线分析'],
    notDo: { editorial: [], technical: [] },
    boundary: { adaptable: [], askFirst: [...LOCKED_BOUNDARY] },
    edit: { editable: true, reason: null, lastEdit: null, planEnvelopeDigest: 'e'.repeat(64), budget: { ceiling: { kind: 'tokens', maxTotalTokens: 240_000 }, settable: false, reason: '这次启动的预算上限由开发者实时启动参数决定，不能在计划里设置。' } },
    drift: null,
    technical: [{ key: 'plan-envelope', label: '计划权限边界', value: 'e'.repeat(64) }],
    start: { readiness: 'ready', needsModelConnection: true, planEnvelopeDigest: 'e'.repeat(64), categoryDigests: [], reconfirm: null, ...start },
    defaultRule: { canSet: false, reason: '这份计划不能设为快速开始默认。', planEnvelopeDigest: null, current: null, binds: [], startedBy: null },
    runControl: null,
    redo: null,
    resend: null,
    unconfirmed: null,
    reprepare: null,
    clarifications: [],
    budgetStop: null,
  };
}
