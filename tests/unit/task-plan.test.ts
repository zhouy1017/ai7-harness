import { describe, expect, it } from 'vitest';
import type { ManifestBlockInput } from '../../src/service/analysis/coverage-manifest.js';
import type { BaselineAnalysisProjection, TaskPlanProjection, TaskPlanStartProjection } from '../../src/shared/protocol.js';
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
  withResumeBlockers,
  withWaitingReason,
  OFFLINE_STATE,
  WAITING_LABELS,
  CANCELLATION_NO_EFFECTS,
  RUN_CONTROL_CANCELLING_REASON,
  RUN_CONTROL_PAUSE_REASON,
  RUN_CONTROL_REDO_REASON,
  redoGoalSentence,
  CLARIFICATION_AFTER,
  CLARIFICATION_NOTE,
  CLARIFICATION_OPTIONS,
  CLARIFICATION_SCOPE_CONTINUING,
  CLARIFICATION_SCOPE_PAUSED,
  CLARIFICATION_SCOPE_RESUMABLE,
  CLARIFICATION_SCOPE_WAITING,
  CLARIFICATION_UNANSWERABLE_CANCELLING,
  CLARIFICATION_UNANSWERABLE_ENDED,
  CLARIFICATION_WHY,
  clarificationAnsweredLine,
  clarificationQuestion,
  RESUME_BLOCKED_BINDING,
  RESUME_BLOCKED_CONNECTION,
  RESUME_BLOCKED_OFFLINE,
  RESUME_BLOCKED_SLOT,
  baselineCancellationImpact,
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

  it('reads the editor\'s own edits in the drawer\'s words, as edits (Issue #419, PLAN-011)', () => {
    const step = { field: 'steps.assurance-sampling' as const, label: '核对与抽检', prior: '要做', proposed: '不做', materiality: 'edited' as const };
    expect(driftEntry(step, BLOCKS)).toEqual({ field: 'steps.assurance-sampling', label: '步骤 · 核对与抽检', prior: '要做', proposed: '不做', materiality: 'edited' });
    const retry = { field: 'adaptations.safe-retry' as const, label: '模型服务暂时出错时，同一个阅读范围安全地再试一次', prior: '允许', proposed: '不允许', materiality: 'edited' as const };
    expect(driftEntry(retry, BLOCKS)).toEqual({ field: 'adaptations.safe-retry', label: '可以自己调整 · 安全地再试一次', prior: '允许', proposed: '不允许', materiality: 'edited' });
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
      edit: { editable: true, reason: null, lastEdit: null, planEnvelopeDigest: 'e'.repeat(64), budget: { ceiling: { kind: 'tokens', maxTotalTokens: 240_000 }, settable: false, reason: '这次启动的预算上限由开发者实时启动参数决定，不能在计划里设置。' } },
      drift: null,
      technical: [{ key: 'plan-envelope', label: '计划权限边界', value: 'e'.repeat(64) }],
      start: { readiness: 'ready', needsModelConnection: true, planEnvelopeDigest: 'e'.repeat(64), categoryDigests: [], reconfirm: null, ...start },
      defaultRule: { canSet: false, reason: '这份计划不能设为快速开始默认。', planEnvelopeDigest: null, current: null, binds: [], startedBy: null },
      runControl: null,
      redo: null,
      reprepare: null,
      clarifications: [],
      budgetStop: null,
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
      // 更新计划 keeps the version it edits: only 开始任务's digest is withheld (Issue #419).
      expect(blocked.edit.planEnvelopeDigest).toBe('e'.repeat(64));
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

// 取消任务 (Issue #422, plan slice S76a): the Cancellation Impact Summary names exactly where the Run stands, from the
// Run Liveness Signal alone, and the two controls this slice does not bring say why.
describe('the Cancellation Impact Summary (CTRL-004)', () => {
  type Run = NonNullable<BaselineAnalysisProjection['run']>;
  const progress = (overrides: Partial<NonNullable<Run['progress']>> = {}): NonNullable<Run['progress']> => ({
    unitsTotal: 8, unitsSettled: 2, currentUnitOrdinal: 3, currentUnitStartedAt: '2026-09-24T01:00:30.000Z',
    attemptState: 'dispatched', completedAttempts: 2, longestSettledUnitMs: 10, stage: 'units',
    lastTransitionAt: '2026-09-24T01:00:00.000Z', ...overrides,
  });
  const run = (state: Run['state'], live: Run['progress']): Run => ({
    runRecordId: 'run', state, stateLabel: '', recordedAt: '2026-09-24T01:00:00.000Z', transitions: [], adaptations: [],
    blockedReasons: null, blockedBy: null, progress: live, attempt: null,
  });

  it('says why 暂停 and 改计划重做 are not offered, and that the analysis leaves nothing committed', () => {
    expect(RUN_CONTROL_PAUSE_REASON).toBe('这项任务现在没有在运行，不能暂停；可以取消它');
    expect(RUN_CONTROL_REDO_REASON).toBe('先暂停，再改计划重做');
    // The redo Task's own sentence (Issue #422, S76c): what it carries, and what it reads again.
    expect(redoGoalSentence({ reused: 6, recomputed: 2, invalidated: 2, bypassed: 0 })).toBe('改计划重做：沿用已读完的 6 个阅读范围，接着读其余 2 个');
    // Carrying none — the first baseline again, or an update the Run kept nothing of — it starts from the beginning.
    // Carrying nothing, it never says the Run read nothing: what it read may be what this launch could not carry.
    expect(redoGoalSentence(null)).toBe('改计划重做：不沿用上一次运行的结果，这次从头读');
    expect(redoGoalSentence({ reused: 0, recomputed: 8, invalidated: 8, bypassed: 0 })).toBe('改计划重做：不沿用上一次运行的结果，这次从头读');
    expect(RUN_CONTROL_CANCELLING_REASON).toBe('已在取消：正在进行的这一步完成后停止');
    expect(CANCELLATION_NO_EFFECTS).toBe('这项分析不改稿，没有需要撤回的受控动作。');
  });

  it('names the unit in flight, the ones left, what is kept, and the one answer not back yet', () => {
    expect(baselineCancellationImpact(run('executing', progress()))).toEqual([
      '正在读的第 3 个阅读范围读完后停止；其余 5 个阅读范围和之后的归纳、抽样都不再进行，不再发送任何内容。',
      '已读完的 2 个阅读范围和正在读的这一个的结果与缺口会保留在一份新的结果集修订版里，没读到的记为未尝试；这份修订版会成为这本书最新的分析。',
      CANCELLATION_NO_EFFECTS,
      '正在等待的那一轮模型回答不会被中途切断，它的结果照常计入。',
    ]);
  });

  it('names the rest of an update Run as ranges to analyse again, and keeps the ranges it reuses in view (CTRL-004)', () => {
    // Units 3 and 7 edited, then 同步到当前稿件: two ranges read again, six reused.
    const impact = baselineCancellationImpact(run('executing', progress({ unitsTotal: 2, unitsSettled: 1, currentUnitOrdinal: 7 })), { manuscriptUnits: 8, reusedUnits: 6 });
    expect(impact.slice(0, 2)).toEqual([
      '正在读的第 7 个阅读范围读完后停止；之后的归纳、抽样都不再进行，不再发送任何内容。',
      '已读完的 1 个阅读范围和正在读的这一个的结果与缺口，连同沿用上一份分析的 6 个阅读范围，会保留在一份新的结果集修订版里，没读到的记为未尝试；这份修订版会成为这本书最新的分析。',
    ]);
  });

  it('stops a Run between two units there, with no answer outstanding', () => {
    expect(baselineCancellationImpact(run('executing', progress({ currentUnitOrdinal: null, currentUnitStartedAt: null, attemptState: null })))).toEqual([
      '在这两个阅读范围之间停止；其余 6 个阅读范围和之后的归纳、抽样都不再进行，不再发送任何内容。',
      '已读完的 2 个阅读范围的结果与缺口会保留在一份新的结果集修订版里，没读到的记为未尝试；这份修订版会成为这本书最新的分析。',
      CANCELLATION_NO_EFFECTS,
    ]);
  });

  it('stops a later step once it completes, and a Run not yet reading before anything is sent', () => {
    expect(baselineCancellationImpact(run('executing', progress({ stage: 'assurance-sampling', unitsSettled: 8, currentUnitOrdinal: null })))[0])
      .toBe('正在进行的保证抽样完成后停止，之后的步骤都不再进行，不再发送任何内容。');
    expect(baselineCancellationImpact(run('admitted', null))).toEqual([
      '这项任务还没有开始阅读；取消后不会发送任何内容，也不会形成结果集修订版。',
      CANCELLATION_NO_EFFECTS,
    ]);
  });

  it('adds what 续行 waits for to a stopped Run\'s own reasons, sentence after sentence (S76b; CONT-015)', () => {
    expect(RESUME_BLOCKED_SLOT).toBe('运行名额已满：正在运行的任务结束后再续行。');
    expect(RESUME_BLOCKED_CONNECTION).toBe('模型未连接：续行要发送到模型服务，所需的凭据还没有就绪；连接好之后才能续行。');
    expect(RESUME_BLOCKED_OFFLINE).toBe('离线：续行要连到模型服务，而这台设备现在没有网络；联网后再续行。');
    const stopped = { runControl: { resume: { reason: null } } } as unknown as TaskPlanProjection;
    expect(withResumeBlockers(stopped, [])).toBe(stopped);
    expect(withResumeBlockers(stopped, [RESUME_BLOCKED_SLOT, RESUME_BLOCKED_OFFLINE]).runControl?.resume?.reason)
      .toBe('运行名额已满：正在运行的任务结束后再续行。离线：续行要连到模型服务，而这台设备现在没有网络；联网后再续行。');
    const moved = { runControl: { resume: { reason: '计划的关键内容已经变化：模型。' } } } as unknown as TaskPlanProjection;
    expect(withResumeBlockers(moved, [RESUME_BLOCKED_CONNECTION]).runControl?.resume?.reason).toBe(`计划的关键内容已经变化：模型。${RESUME_BLOCKED_CONNECTION}`);
    // A Run under way offers no 续行 to hold back.
    const running = { runControl: { resume: null } } as unknown as TaskPlanProjection;
    expect(withResumeBlockers(running, [RESUME_BLOCKED_SLOT])).toBe(running);
  });

  it('says what a stopped Run kept, and that nothing is in flight (S76b)', () => {
    expect(baselineCancellationImpact(run('paused', null), null, { unitsSettled: 3, unitsTotal: 8 })).toEqual([
      '这项任务已经停下；其余 5 个阅读范围和之后的归纳、抽样都不再进行，不再发送任何内容。',
      '已读完的 3 个阅读范围的结果与缺口会保留在一份新的结果集修订版里，没读到的记为未尝试；这份修订版会成为这本书最新的分析。',
      CANCELLATION_NO_EFFECTS,
    ]);
    expect(baselineCancellationImpact(run('resumable', null), null, { unitsSettled: 0, unitsTotal: 8 })).toEqual([
      '这项任务还没有读完任何阅读范围；取消后不会发送任何内容，也不会形成结果集修订版。',
      CANCELLATION_NO_EFFECTS,
    ]);
    // Under a launch that can no longer carry the Run's binding, what it read cannot become its revision (S76c).
    expect(baselineCancellationImpact(run('paused', null), null, { unitsSettled: 3, unitsTotal: 8, bindingHolds: false })).toEqual([
      '这项任务已经停下；其余 5 个阅读范围和之后的归纳、抽样都不再进行，不再发送任何内容。',
      '执行绑定已经变化，已读完的 3 个阅读范围不能整理成结果集修订版；这次取消不会形成修订版。',
      CANCELLATION_NO_EFFECTS,
    ]);
    // CONT-016: a Run that cannot go on as it was authorized is redone, never continued past its authorization.
    expect(RESUME_BLOCKED_BINDING).toBe('这次运行授权时的执行绑定已经变化（模型服务、路由、策略或 AI7 版本不同），不能照原样续行；请改计划重做。');
  });

  it('tells the truth about a Run no execution holds: nothing runs, and nothing of it was kept', () => {
    expect(baselineCancellationImpact(run('executing', null))).toEqual([
      'AI7 上次关闭时这项任务没有结束，现在也没有在运行；取消只结束这条运行记录，不会再发送任何内容。',
      '它已读完的阅读范围的结果没有保存下来，不会形成结果集修订版。',
      CANCELLATION_NO_EFFECTS,
    ]);
  });

  it('reads what a Run no execution holds kept from its checkpoints, and says when that no longer reads back (S76b)', () => {
    // Left 正在取消 when AI7 closed, with two ranges kept: its cancellation gathers them.
    expect(baselineCancellationImpact(run('cancelling', null), null, { unitsSettled: 2, unitsTotal: 8 })).toEqual([
      'AI7 上次关闭时这项任务没有结束，现在也没有在运行；其余 6 个阅读范围和之后的归纳、抽样都不再进行，不再发送任何内容。',
      '已读完的 2 个阅读范围的结果与缺口会保留在一份新的结果集修订版里，没读到的记为未尝试；这份修订版会成为这本书最新的分析。',
      CANCELLATION_NO_EFFECTS,
    ]);
    expect(baselineCancellationImpact(run('executing', null), null, { unitsSettled: 0, unitsTotal: 8 })).toEqual([
      'AI7 上次关闭时这项任务没有结束，现在也没有在运行；取消只结束这条运行记录，不会再发送任何内容。',
      '它还没有读完任何阅读范围，不会形成结果集修订版。',
      CANCELLATION_NO_EFFECTS,
    ]);
    expect(baselineCancellationImpact(run('cancelling', null), null, { unitsSettled: null, unitsTotal: 8 })[1])
      .toBe('它已保存的阅读进度无法核对，不会形成结果集修订版。');
    expect(baselineCancellationImpact(run('paused', null), null, { unitsSettled: null, unitsTotal: 8 })).toEqual([
      '这项任务已经停下，它已保存的阅读进度无法核对；取消后不会发送任何内容，也不会形成结果集修订版。',
      CANCELLATION_NO_EFFECTS,
    ]);
  });

  it('names the ranges that asked the editor, answered or not, and ends them as gaps (S76d, D7)', () => {
    // Seven ranges read, the eighth asked: the summary names it, and nothing else is left to read.
    expect(baselineCancellationImpact(run('awaiting-clarification', null), null, { unitsSettled: 7, unitsTotal: 8, waiting: [{ unitOrdinal: 5, answered: false }] })).toEqual([
      '这项任务已经停下；之后的归纳、抽样都不再进行，不再发送任何内容。',
      '已读完的 7 个阅读范围的结果与缺口会保留在一份新的结果集修订版里，没读到的记为未尝试；这份修订版会成为这本书最新的分析。',
      '第 5 个阅读范围在等你的回答；取消后不再重试，在这份修订版里记为缺口。',
      CANCELLATION_NO_EFFECTS,
    ]);
    // Every range it read asked: its gaps are its revision, one of them answered but not yet gone on by.
    expect(baselineCancellationImpact(run('paused', null), null, { unitsSettled: 0, unitsTotal: 4, waiting: [{ unitOrdinal: 3, answered: true }, { unitOrdinal: 7, answered: false }] })).toEqual([
      '这项任务已经停下；其余 2 个阅读范围和之后的归纳、抽样都不再进行，不再发送任何内容。',
      '第 7 个阅读范围在等你的回答；取消后不再重试，记为缺口。',
      '第 3 个阅读范围你已回答，但还没有按回答接着做；取消后不再重试，记为缺口。',
      '这些缺口和没读到的阅读范围（记为未尝试）会保留在一份新的结果集修订版里；这份修订版会成为这本书最新的分析。',
      CANCELLATION_NO_EFFECTS,
    ]);
    // Under a launch that can no longer carry the Run, nothing of it becomes a revision.
    expect(baselineCancellationImpact(run('paused', null), null, { unitsSettled: 0, unitsTotal: 4, bindingHolds: false, waiting: [{ unitOrdinal: 3, answered: false }] }).slice(1, 3)).toEqual([
      '第 3 个阅读范围在等你的回答；取消后不再重试。',
      '执行绑定已经变化，这次取消不会形成结果集修订版。',
    ]);
  });

  it('keeps what a continuing Run kept in view while it waits its turn in the slot', () => {
    // 续行 admitted with three ranges kept: nothing is in flight, and the three are its partial revision.
    expect(baselineCancellationImpact(run('admitted', progress({ unitsSettled: 3, currentUnitOrdinal: null, currentUnitStartedAt: null, attemptState: null })))).toEqual([
      '在这两个阅读范围之间停止；其余 5 个阅读范围和之后的归纳、抽样都不再进行，不再发送任何内容。',
      '已读完的 3 个阅读范围的结果与缺口会保留在一份新的结果集修订版里，没读到的记为未尝试；这份修订版会成为这本书最新的分析。',
      CANCELLATION_NO_EFFECTS,
    ]);
    expect(baselineCancellationImpact(run('admitted', progress({ unitsSettled: 0, currentUnitOrdinal: null })))).toEqual([
      '这项任务还没有开始阅读；取消后不会发送任何内容，也不会形成结果集修订版。',
      CANCELLATION_NO_EFFECTS,
    ]);
  });
});

// Issue #422 (plan slice S76d; CLAR-002, INPUT-002, INPUT-003): the question card's own words.
describe('a Clarification Request card (S76d)', () => {
  it('asks in the editor\'s words, with two choices — one 推荐 with its reason — and a note that qualifies one', () => {
    expect(clarificationQuestion(5)).toBe('第 5 个阅读范围：模型服务暂时出错，这一次没有读成。要安全地再试一次吗？');
    expect(CLARIFICATION_WHY).toBe('你把「模型服务暂时出错时，同一个阅读范围安全地再试一次」改成了「先问你」，所以 AI7 先停下这一步来问你。');
    expect([CLARIFICATION_SCOPE_CONTINUING, CLARIFICATION_SCOPE_WAITING]).toEqual(['该步骤等待说明 · 其他步骤仍在继续', '任务等待你的说明']);
    expect(CLARIFICATION_SCOPE_PAUSED).toBe('任务已暂停：回答会先记下，续行后按它接着做');
    expect(CLARIFICATION_SCOPE_RESUMABLE).toBe('任务已中断：回答会先记下，续行后按它接着做');
    expect(CLARIFICATION_AFTER).toBe('回答后：选「再试一次」，AI7 把这个阅读范围再发送一次；选「不重试，记为缺口」，它记为缺口。之后接着做归纳和抽样。');
    expect(CLARIFICATION_OPTIONS.map((option) => [option.id, option.label, option.recommended])).toEqual([
      ['retry', '再试一次', '推荐：这类错误通常是暂时的，再试一次就能安全地补上这个阅读范围'],
      ['record-gap', '不重试，记为缺口', null],
    ]);
    expect(CLARIFICATION_NOTE).toEqual({ label: '自行说明…', hint: '补充你的考虑，和所选的回答一起记下；不改变所选回答的意思。', maxLength: 500 });
    expect(clarificationAnsweredLine('再试一次', null)).toBe('你已回答：再试一次');
    expect(clarificationAnsweredLine('不重试，记为缺口', '先看看')).toBe('你已回答：不重试，记为缺口 · 说明：先看看');
    expect([CLARIFICATION_UNANSWERABLE_ENDED, CLARIFICATION_UNANSWERABLE_CANCELLING])
      .toEqual(['这次运行已经结束，这个问题不再等你回答', '任务正在取消，这个问题不再等你回答']);
    expect(RESUME_BLOCKED_BINDING.endsWith('请改计划重做。')).toBe(true);
  });
});
