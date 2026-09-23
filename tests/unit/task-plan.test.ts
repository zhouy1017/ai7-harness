import { describe, expect, it } from 'vitest';
import type { ManifestBlockInput } from '../../src/service/analysis/coverage-manifest.js';
import type { TaskPlanProjection, TaskPlanStartProjection } from '../../src/shared/protocol.js';
import {
  ACCOUNT_LIMIT_UNKNOWN,
  BUDGET_NOT_SET,
  LOCKED_BOUNDARY,
  MODEL_UNCONNECTED_STATE,
  budgetCeilingLabel,
  driftEntry,
  groupedCount,
  pinReading,
  positionLabel,
  readRange,
  withConnectionReadiness,
  withConnectivityReadiness,
  withWaitingReason,
  OFFLINE_STATE,
  WAITING_LABELS,
} from '../../src/service/task-plan.js';

// The pure half of the Task Drawer's plan projection (Issue #418, plan slice S72): the range a plan reads
// and how it is named (D5), the diff relabelled by field key and never by the label a stored record
// carries (D8), and the words MODEL-013/014 fix. Synthetic blocks only; no manuscript text.

function block(position: number, kind: ManifestBlockInput['kind'], graphemes: number, text = '合成占位'): ManifestBlockInput {
  return { blockId: `b${String(position).padStart(4, '0')}`, position, kind, level: kind === 'heading' ? 1 : null, text, digest: 'a'.repeat(64), graphemes };
}

const BLOCKS: ReadonlyArray<ManifestBlockInput> = [
  block(1, 'title', 4, '合成书名'),
  block(2, 'heading', 3, '第一章'),
  block(3, 'paragraph', 1200),
  block(4, 'paragraph', 800),
  block(5, 'heading', 3, '第二章'),
  block(6, 'paragraph', 500),
  block(7, 'heading', 3, '第三章'),
  block(8, 'paragraph', 250),
];

describe('the range a plan reads', () => {
  it('sums the graphemes of the range, or of the whole revision', () => {
    expect(readRange(BLOCKS, null).graphemes).toBe(2763);
    expect(readRange(BLOCKS, { startPosition: 3, endPosition: 4 }).graphemes).toBe(2000);
  });

  it('names the chapter headings the range holds, 第 a–b 段 when it holds none, and 全书 for the whole', () => {
    expect(positionLabel(readRange(BLOCKS, null))).toBe('全书');
    expect(positionLabel(readRange(BLOCKS, { startPosition: 3, endPosition: 4 }))).toBe('第 3–4 段');
    expect(positionLabel(readRange(BLOCKS, { startPosition: 2, endPosition: 4 }))).toBe('「第一章」');
    expect(positionLabel(readRange(BLOCKS, { startPosition: 2, endPosition: 8 }))).toBe('「第一章」至「第三章」');
  });

  it('bounds a long heading and groups counts without reading a locale', () => {
    const long = '长'.repeat(60);
    expect(positionLabel(readRange([block(1, 'heading', 60, long)], { startPosition: 1, endPosition: 1 }))).toBe(`「${'长'.repeat(39)}…」`);
    expect(groupedCount(0)).toBe('0');
    expect(groupedCount(999)).toBe('999');
    expect(groupedCount(1240)).toBe('1,240');
    expect(groupedCount(1234567)).toBe('1,234,567');
  });
});

describe('the diff of a plan whose key content changed (D8)', () => {
  it('reads every entry by its field key, never by the label the stored record carries', () => {
    const stored = { field: 'selectedRange' as const, label: '重新分析所选范围 · 目标范围', prior: { startPosition: 3, endPosition: 4 }, proposed: { startPosition: 6, endPosition: 6 }, materiality: 'material' as const };
    expect(driftEntry(stored, BLOCKS)).toEqual({ field: 'selectedRange', label: '处理范围', prior: '第 3–4 段 · 2,000 字', proposed: '第 6–6 段 · 500 字', materiality: 'material' });
    const counts = { field: 'reusePlan.counts' as const, label: '复用计划 · 复用/重算/失效/绕过', prior: { reused: 5, recomputed: 3, invalidated: 1, bypassed: 2 }, proposed: { reused: 6, recomputed: 2, invalidated: 1, bypassed: 1 }, materiality: 'derived' as const };
    expect(driftEntry(counts, BLOCKS)).toEqual({ field: 'reusePlan.counts', label: '重新分析与沿用的阅读范围', prior: '重新分析 3 个，沿用 5 个', proposed: '重新分析 2 个，沿用 6 个', materiality: 'derived' });
    const predecessor = { field: 'predecessorRevision' as const, label: '前一结果集修订版', prior: { revisionId: 'x', ordinal: 2, digest: 'd' }, proposed: { revisionId: 'y', ordinal: 3, digest: 'e' }, materiality: 'material' as const };
    expect(driftEntry(predecessor, BLOCKS)).toMatchObject({ label: '要更新的那一份分析', prior: '第 2 份分析', proposed: '第 3 份分析' });
    const ceiling = { field: 'runBudgetCeiling' as const, label: 'Run Budget Ceiling 状态', prior: 'unset', proposed: { kind: 'tokens' as const, maxTotalTokens: 240000 }, materiality: 'material' as const };
    expect(driftEntry(ceiling, BLOCKS)).toMatchObject({ label: '预算上限', prior: '未设置任务预算上限', proposed: '任务运行预算上限：240,000 tokens' });
    const outbound = { field: 'outboundDataCategory' as const, label: '外发数据类别', prior: 'public-or-synthetic', proposed: 'public-or-synthetic', materiality: 'material' as const };
    expect(driftEntry(outbound, BLOCKS)).toMatchObject({ label: '发送内容类别', prior: '公开或合成材料' });
  });
});

describe('the words the ceiling, the account limit and the boundary are fixed to', () => {
  it('never renders an unset ceiling or an unknown account limit as a value (MODEL-013, MODEL-014)', () => {
    expect(budgetCeilingLabel('unset')).toBe(BUDGET_NOT_SET);
    expect(BUDGET_NOT_SET).toBe('未设置任务预算上限');
    expect(budgetCeilingLabel({ kind: 'tokens', maxTotalTokens: 30000 })).toBe('任务运行预算上限：30,000 tokens');
    expect(ACCOUNT_LIMIT_UNKNOWN).toBe('未知 · 提供方未返回');
    for (const text of [BUDGET_NOT_SET, ACCOUNT_LIMIT_UNKNOWN]) expect(text).not.toMatch(/^0$|免费|无限/u);
  });

  it('reads the Provider Processing pin byte for byte as the frozen plan always did, whatever the scope', () => {
    // Captured from the J-03 card's plan preview before the plan moved into the drawer (Issue #418).
    expect(pinReading({ operationalScope: 'development-ci', version: 'v1', decision: 'deny', authorizedLiveTransmissionCount: 0 }))
      .toBe('development-ci · v1 · 拒绝 · 0 次实时传输');
    expect(pinReading({ operationalScope: 'developer-live', version: 'v5', decision: 'eligible-only', authorizedLiveTransmissionCount: 'bounded-by-run' }))
      .toBe('developer-live · v5 · eligible-only · bounded-by-run 次实时传输');
  });

  it('locks the three groups the authorization rules fix (PLAN-004)', () => {
    expect(LOCKED_BOUNDARY).toEqual(['要做的事、处理范围、参考范围与所用工序', '模型服务、发送内容类别、预算上限', '结果类型、受控动作']);
  });
});

// Issue #420 (plan slice S74a A3): route-aware readiness. A synthetic plan only; the service suite reads the
// real store's plans through the same applier.
describe('route-aware readiness of the authorization bar (S74a A3; AUTH-005, MODEL-008, OFF-009)', () => {
  function planWith(start: Partial<TaskPlanStartProjection>): TaskPlanProjection {
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
      service: { role: '主编辑角色', provider: 'opencode-go · deepseek-v4-flash', decision: '开发者实时', send: '发往 opencode-go', sendCategory: '公开或合成材料', usage: '至多 240,000 tokens（8 个阅读范围）', usageIsCeiling: true, duration: '暂无可靠估计', budgetCeiling: '任务运行预算上限：240,000 tokens', accountLimit: ACCOUNT_LIMIT_UNKNOWN },
      outcomes: ['一份基线分析'],
      notDo: { editorial: [], technical: [] },
      boundary: { adaptable: [], askFirst: [...LOCKED_BOUNDARY] },
      drift: null,
      technical: [{ key: 'plan-envelope', label: '计划权限边界', value: 'e'.repeat(64) }],
      start: { readiness: 'ready', needsModelConnection: true, planEnvelopeDigest: 'e'.repeat(64), categoryDigests: [], reconfirm: null, ...start },
      defaultRule: { canSet: false, reason: '这份计划不能设为快速开始默认。', current: null, binds: [], startedBy: null },
    };
  }

  it('lets a plan whose route sends start only while the credential it resolves is present', () => {
    const live = planWith({});
    expect(withConnectionReadiness(live, 'present')).toBe(live);
    for (const credential of ['missing', null] as const) {
      const blocked = withConnectionReadiness(live, credential);
      expect(blocked.state).toEqual({ key: 'unconnected', label: '模型未连接' });
      expect(MODEL_UNCONNECTED_STATE).toEqual({ key: 'unconnected', label: '模型未连接' });
      expect(blocked.start).toEqual({ readiness: 'needs-connection', needsModelConnection: true, planEnvelopeDigest: null, categoryDigests: [], reconfirm: null });
      // The blocker is the Run's, never the plan's: no drift is invented and every frozen fact stays (OFF-009).
      expect(blocked.drift).toBeNull();
      expect({ ...blocked, state: live.state, start: live.start }).toEqual(live);
    }
  });

  it('asks nothing of a route that sends nothing, of a started plan, or of a changed one', () => {
    const deterministic = planWith({ needsModelConnection: false });
    expect(withConnectionReadiness(deterministic, 'missing')).toBe(deterministic);
    const recordOnly = planWith({ readiness: 'record-only', needsModelConnection: false });
    expect(withConnectionReadiness(recordOnly, null)).toBe(recordOnly);
    const started = planWith({ readiness: 'started', planEnvelopeDigest: null });
    expect(withConnectionReadiness(started, 'missing')).toBe(started);
    const changed = planWith({ readiness: 'changed', planEnvelopeDigest: null });
    expect(withConnectionReadiness(changed, 'missing')).toBe(changed);
  });

  it('reads 离线 for a plan whose route reaches its model over a network the device lacks, keeping what 开始任务 would bind (Issue #502; OFF-004)', () => {
    const live = planWith({});
    const offline = withConnectivityReadiness(live, true, 'offline');
    expect(OFFLINE_STATE).toEqual({ key: 'offline', label: '离线' });
    expect(offline.state).toEqual({ key: 'offline', label: '离线' });
    // 联网后开始任务 binds exactly the digest 开始任务 would, and nothing frozen moves: the reading is the device's.
    expect(offline.start).toEqual({ ...live.start, readiness: 'offline' });
    expect(offline.drift).toBeNull();
    expect({ ...offline, state: live.state, start: live.start }).toEqual(live);
    expect(withConnectivityReadiness(live, true, 'online')).toBe(live);
  });

  it('asks the network nothing of a route that does not reach one or of a plan that is not ready — 模型未连接 is decided first', () => {
    const live = planWith({});
    expect(withConnectivityReadiness(live, false, 'offline')).toBe(live);
    const unconnected = withConnectionReadiness(live, 'missing');
    expect(withConnectivityReadiness(unconnected, true, 'offline')).toBe(unconnected);
    for (const readiness of ['record-only', 'no-route', 'changed', 'started'] as const) {
      const other = planWith({ readiness, planEnvelopeDigest: null });
      expect(withConnectivityReadiness(other, true, 'offline')).toBe(other);
    }
  });

  it('says what a waiting Run waits for in its own words, and leaves every other plan as it came (OFF-006, OFF-009)', () => {
    expect(WAITING_LABELS).toEqual({ network: '等待网络', connection: '需要处理模型连接', slot: '等待运行名额', admitting: '正在排队' });
    const waiting: TaskPlanProjection = { ...planWith({ readiness: 'started', planEnvelopeDigest: null }), state: { key: 'waiting', label: '等待网络' } };
    for (const [reason, label] of Object.entries(WAITING_LABELS)) {
      expect(withWaitingReason(waiting, reason as keyof typeof WAITING_LABELS).state).toEqual({ key: 'waiting', label });
    }
    const running: TaskPlanProjection = { ...waiting, state: { key: 'running', label: '运行中' } };
    expect(withWaitingReason(running, 'slot')).toBe(running);
  });
});
