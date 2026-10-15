import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ProtocolError, decodeRequest } from '../../src/service/request-frames.js';
import {
  BACKGROUND_ANALYSIS_NOT_GRANTED,
  BACKGROUND_ATTEMPTED,
  BACKGROUND_OUTCOME_UNKNOWN,
  BACKGROUND_CURRENT,
  BACKGROUND_CEILING_RULE,
  BACKGROUND_NO_CEILING,
  BACKGROUND_NO_RULE,
  BACKGROUND_PAUSED,
  BACKGROUND_EDITOR_TASK,
  BACKGROUND_FACTS_UNREADABLE,
  BACKGROUND_NOT_ENROLLED,
  BACKGROUND_NOT_MOVED,
  BACKGROUND_NO_ROUTE,
  BACKGROUND_NO_SHARE,
  BACKGROUND_PLACE_BUSY,
  BACKGROUND_PREPARATION_IN_FLIGHT,
  BACKGROUND_EDITOR_JOB,
  BACKGROUND_RECOVERY_PENDING,
  BACKGROUND_RECORD_DAMAGED,
  BACKGROUND_REPLACEMENT_WAITING,
  BACKGROUND_CHECKPOINT_PREEMPTED,
  BACKGROUND_PREPARATION_INCOMPLETE,
  backgroundStepFailureReason,
  backgroundAnalysisDecisionOf,
  BACKGROUND_REVOKED,
  BACKGROUND_SUSPENDED,
  backgroundAnalysisShare,
  backgroundShareFullReason,
  BACKGROUND_REVOKE_CONSEQUENCES,
  BACKGROUND_START_FIRST,
  BACKGROUND_START_SYNC,
  BACKGROUND_STARTING_POINT_LABELS,
  BACKGROUND_STATE_LABELS,
  BACKGROUND_TASK_PREPARED,
  BACKGROUND_TASK_RUNNING,
  backgroundAnalysisDecision,
  backgroundAnalysisWhen,
  backgroundCeilingShares,
  backgroundCeilingTooLowReason,
  backgroundDriftReason,
  backgroundEnrollmentName,
  backgroundQuietReason,
  backgroundRunReportLines,
  backgroundScopeLabel,
  type BackgroundAnalysisFacts,
} from '../../src/service/background-analysis-enrollments.js';
import { parseBackgroundQuietMs } from '../../src/shared/protocol.js';
import type { BackgroundAnalysisEnrollmentProjection } from '../../src/shared/protocol.js';
import {
  BACKGROUND_ENROLL_OPEN,
  BACKGROUND_PAUSE,
  BACKGROUND_RESUME,
  backgroundCeilingLine,
  backgroundCeilingOf,
  backgroundCeilingShares as rendererCeilingShares,
  backgroundSharePreview,
  backgroundSkippedLine,
  backgroundChangeKey,
  backgroundLookLine,
  backgroundNotStartedLine,
  BACKGROUND_REVOKE_OPEN,
  backgroundEnrollmentLine,
  backgroundHistoryLine,
  backgroundNextLine,
  backgroundStartedLine,
  backgroundStartedMoreLine,
} from '../../src/renderer/background-analysis-labels.js';

// Unit suite for 后台分析登记 (Issue #95, plan slice S39; ADR 0048): the dispatcher's decision is a pure reading of the facts,
// in a fixed order; the frames carry exactly the route's Book, the confirmed disclosure and one of two starting points; and
// the block's words.

const encoder = new TextEncoder();
const frameOf = (value: unknown): Uint8Array => encoder.encode(JSON.stringify(value));
function rejectionFor(frame: Uint8Array): ProtocolError {
  try {
    decodeRequest(frame);
  } catch (error) {
    if (error instanceof ProtocolError) return error;
    throw error;
  }
  throw new Error('expected decodeRequest to reject this frame');
}

/** Every condition holding for a start over a stale analysis. */
const READY: BackgroundAnalysisFacts = {
  enrollment: 'active',
  paused: false,
  ceiling: true,
  ruleAdmits: true,
  routeExecutable: true,
  share: 1,
  replacementWaiting: false,
  recoveryPending: false,
  drift: [],
  preparationInFlight: false,
  editorJobRunning: false,
  taskUnfinished: null,
  analysis: 'stale',
  changedSinceEditorTask: true,
  startingPoint: 'prospective',
  movedSinceEnrollment: true,
  unconfirmedPending: false,
  attemptedAtThisText: false,
  sinceLastEditMs: 60_000,
  quietMs: 30_000,
  placeFree: true,
  backgroundRunning: 0,
};

describe('the 后台分析登记 decision', () => {
  it('starts only while every condition holds: sync-current over a stale analysis, the first baseline over none', () => {
    expect(backgroundAnalysisDecision(READY)).toEqual({ kind: 'start', mode: 'sync-current', reason: BACKGROUND_START_SYNC });
    expect(backgroundAnalysisDecision({ ...READY, analysis: 'absent' })).toEqual({ kind: 'start', mode: 'first-baseline', reason: BACKGROUND_START_FIRST });
    // A backfill Enrollment needs no change since it was made; a text never edited has no quiet period to wait out.
    expect(backgroundAnalysisDecision({ ...READY, startingPoint: 'backfill', movedSinceEnrollment: false, sinceLastEditMs: null }).kind).toBe('start');
    // The quiet period is reached exactly at its length.
    expect(backgroundAnalysisDecision({ ...READY, sinceLastEditMs: 30_000 }).kind).toBe('start');
  });

  it('says why it starts nothing, each condition in its fixed order', () => {
    const cases: ReadonlyArray<[Partial<BackgroundAnalysisFacts>, string, string]> = [
      [{ enrollment: null }, 'none', BACKGROUND_NOT_ENROLLED],
      [{ enrollment: 'damaged' }, 'stopped', BACKGROUND_RECORD_DAMAGED],
      [{ enrollment: 'revoked' }, 'stopped', BACKGROUND_REVOKED],
      [{ enrollment: 'suspended' }, 'stopped', BACKGROUND_SUSPENDED],
      // Issue #864: the editor's 暂停, a version made before a ceiling was required, a launch whose policy has no background rule.
      [{ paused: true }, 'stopped', BACKGROUND_PAUSED],
      [{ ceiling: false }, 'stopped', BACKGROUND_NO_CEILING],
      [{ ruleAdmits: false }, 'stopped', BACKGROUND_NO_RULE],
      [{ routeExecutable: false }, 'stopped', BACKGROUND_NO_ROUTE],
      [{ replacementWaiting: true }, 'wait', BACKGROUND_REPLACEMENT_WAITING],
      [{ share: 0 }, 'stopped', BACKGROUND_NO_SHARE],
      [{ recoveryPending: true }, 'wait', BACKGROUND_RECOVERY_PENDING],
      [{ drift: null }, 'stopped', BACKGROUND_FACTS_UNREADABLE],
      [{ drift: ['模型服务'] }, 'stopped', backgroundDriftReason(['模型服务'])],
      [{ preparationInFlight: true }, 'wait', BACKGROUND_PREPARATION_IN_FLIGHT],
      [{ editorJobRunning: true }, 'wait', BACKGROUND_EDITOR_JOB],
      [{ analysis: 'current' }, 'none', BACKGROUND_CURRENT],
      [{ taskUnfinished: 'run' }, 'wait', BACKGROUND_TASK_RUNNING],
      [{ taskUnfinished: 'prepared' }, 'wait', BACKGROUND_TASK_PREPARED],
      [{ changedSinceEditorTask: false }, 'none', BACKGROUND_EDITOR_TASK],
      [{ movedSinceEnrollment: false }, 'none', BACKGROUND_NOT_MOVED],
      // 结果待确认 (Issue #51, S16c): a revision holding an outcome-unknown range is never brought up to date by the dispatcher.
      [{ unconfirmedPending: true }, 'wait', BACKGROUND_OUTCOME_UNKNOWN],
      [{ attemptedAtThisText: true }, 'wait', BACKGROUND_ATTEMPTED],
      [{ sinceLastEditMs: 29_999 }, 'wait', backgroundQuietReason(30_000)],
      [{ placeFree: false }, 'wait', BACKGROUND_PLACE_BUSY],
      [{ backgroundRunning: 1 }, 'wait', backgroundShareFullReason(1)],
    ];
    for (const [facts, kind, reason] of cases) expect(backgroundAnalysisDecision({ ...READY, ...facts }), reason).toEqual({ kind, reason });
    // Revoked outranks everything after it: a revoked Enrollment under a policy with no background rule says it is revoked.
    expect(backgroundAnalysisDecision({ ...READY, enrollment: 'revoked', ruleAdmits: false, placeFree: false }).reason).toBe(BACKGROUND_REVOKED);
    // A paused Enrollment says it is paused before anything else about the launch or the Book; a suspended one says 待你确认.
    expect(backgroundAnalysisDecision({ ...READY, paused: true, ceiling: false, ruleAdmits: false }).reason).toBe(BACKGROUND_PAUSED);
    expect(backgroundAnalysisDecision({ ...READY, enrollment: 'suspended', paused: true }).reason).toBe(BACKGROUND_SUSPENDED);
    // A current analysis is said before any Task is read; a prospective Enrollment over an unmoved text never waits on the clock.
    expect(backgroundAnalysisDecision({ ...READY, taskUnfinished: 'run', analysis: 'current' }).reason).toBe(BACKGROUND_CURRENT);
    expect(backgroundAnalysisDecision({ ...READY, movedSinceEnrollment: false, sinceLastEditMs: 0 }).reason).toBe(BACKGROUND_NOT_MOVED);
    // A preparation under way outranks every reason the Book's own records give, and the editor's own Task outranks a prospective one.
    expect(backgroundAnalysisDecision({ ...READY, preparationInFlight: true, taskUnfinished: 'prepared', analysis: 'current' }).reason).toBe(BACKGROUND_PREPARATION_IN_FLIGHT);
    expect(backgroundAnalysisDecision({ ...READY, changedSinceEditorTask: false, movedSinceEnrollment: false }).reason).toBe(BACKGROUND_EDITOR_TASK);
    // Below the share it starts; at it, it waits.
    expect(backgroundAnalysisDecision({ ...READY, share: 2, backgroundRunning: 1 }).kind).toBe('start');
    expect(backgroundAnalysisDecision({ ...READY, share: 2, backgroundRunning: 2 }).kind).toBe('wait');
  });

  it('reads each fact only when the decision reaches it, and the earliest reason wins', () => {
    const asked: string[] = [];
    const read = Object.fromEntries(Object.entries({ ...READY, analysis: 'current' as const }).map(([fact, value]) => [fact, () => {
      asked.push(fact);
      return value;
    }])) as unknown as Parameters<typeof backgroundAnalysisDecisionOf>[0];
    expect(backgroundAnalysisDecisionOf(read)).toEqual({ kind: 'none', reason: BACKGROUND_CURRENT });
    // Nothing after a current analysis is read: no Task, no editor's Task, no clock, no place.
    expect(asked).toEqual(['enrollment', 'paused', 'ceiling', 'ruleAdmits', 'routeExecutable', 'replacementWaiting', 'share', 'recoveryPending', 'drift', 'preparationInFlight', 'editorJobRunning', 'analysis']);
  });

  it('words a failed preparation step by its code, never by the engineering message', () => {
    const withCode = (code: string) => Object.assign(new Error(`engineering ${code}`), { code });
    expect(backgroundStepFailureReason(withCode('JOB_NOT_FOUND'))).toBe(BACKGROUND_CHECKPOINT_PREEMPTED);
    expect(backgroundStepFailureReason(withCode('REIMPORT_CHECKPOINT_STALE'))).toBe(BACKGROUND_CHECKPOINT_PREEMPTED);
    expect(backgroundStepFailureReason(withCode('RECOVERY_ATTENTION_REQUIRED'))).toBe(BACKGROUND_RECOVERY_PENDING);
    expect(backgroundStepFailureReason(withCode('ANALYSIS_PREPARATION_IN_FLIGHT'))).toBe(BACKGROUND_PREPARATION_IN_FLIGHT);
    for (const error of [withCode('SOMETHING_ELSE'), new Error('plain'), 'a string', null]) expect(backgroundStepFailureReason(error)).toBe(BACKGROUND_PREPARATION_INCOMPLETE);
    expect(BACKGROUND_EDITOR_TASK).toContain('开始或准备过的任务');
  });

  it('leaves one of the governor\'s places for the editor, and none to share of one', () => {
    expect([backgroundAnalysisShare(1), backgroundAnalysisShare(2), backgroundAnalysisShare(3)]).toEqual([0, 1, 2]);
  });

  it('splits a Series or all-Books ceiling equally among its Books in order, the remainder to the first (Issue #864)', () => {
    // Three Books and a ceiling that does not divide: the first takes the remainder.
    expect(backgroundCeilingShares(1000, 3)).toEqual([334, 333, 333]);
    expect(backgroundCeilingShares(1001, 3)).toEqual([335, 333, 333]);
    expect(backgroundCeilingShares(999, 3)).toEqual([333, 333, 333]);
    expect(backgroundCeilingShares(5, 1)).toEqual([5]);
    expect(backgroundCeilingShares(3, 3)).toEqual([1, 1, 1]);
    for (const [ceiling, books] of [[1000, 3], [7, 4], [123_456_789, 11]] as const) {
      const shares = backgroundCeilingShares(ceiling, books);
      expect(shares.reduce((total, share) => total + share, 0)).toBe(ceiling);
      expect(shares.slice(1).every((share) => share === shares[1])).toBe(true);
      // The renderer says the same split before 登记.
      expect(rendererCeilingShares(ceiling, books)).toEqual(shares);
    }
    expect(() => backgroundCeilingShares(0, 3)).toThrow();
    expect(() => backgroundCeilingShares(10, 0)).toThrow();
    expect(backgroundCeilingTooLowReason(3)).toBe('上限至少要有 3 tokens：范围里每本书至少分到 1 个。');
    expect(BACKGROUND_CEILING_RULE).toContain('余数归范围里的第一本');
  });

  it('names the Enrollment, the share and the ceiling outcome in the Run Report (Issue #864)', () => {
    expect(backgroundRunReportLines({ ordinal: 2, scopeLabel: '书系《乙》的 3 本书', ceilingTokens: 1000, shareTokens: 334, frozenTokens: 334, usedTokens: 120, reached: false }))
      .toEqual(['由后台分析登记开始 · 按第 2 版登记', '范围：书系《乙》的 3 本书；登记上限 1000 tokens，本书份额 334 tokens', '没有达到上限：用了 120 tokens，这次运行的上限 334 tokens']);
    expect(backgroundRunReportLines({ ordinal: 1, scopeLabel: '《甲》这一本书', ceilingTokens: 500, shareTokens: 500, frozenTokens: 400, usedTokens: 401, reached: true }))
      .toEqual(['由后台分析登记开始 · 按第 1 版登记', '范围：《甲》这一本书；登记上限 500 tokens', '达到上限后停下：用了 401 tokens，这次运行的上限 400 tokens']);
    expect(backgroundRunReportLines({ ordinal: null, scopeLabel: null, ceilingTokens: null, shareTokens: null, frozenTokens: null, usedTokens: 0, reached: false }))
      .toEqual(['由后台分析登记开始（这份登记的版本不在本机记录里）']);
    expect([backgroundScopeLabel('book', '甲', 1), backgroundScopeLabel('series', '乙', 3), backgroundScopeLabel('all-books', '', 5)])
      .toEqual(['《甲》这一本书', '书系《乙》的 3 本书', '全部 5 本图书']);
  });

  it('words what an Enrollment is, binds, never does, and keeps when revoked', () => {
    expect(BACKGROUND_STATE_LABELS).toEqual({ none: '未登记', active: '已登记', paused: '已暂停', suspended: '待你确认', revoked: '已撤销', damaged: '登记记录无法读取' });
    expect(BACKGROUND_STARTING_POINT_LABELS).toEqual({ prospective: '只分析登记之后的改动', backfill: '现在也分析当前稿件' });
    expect(backgroundEnrollmentName(2)).toBe('后台分析登记 · 第 2 版');
    expect(backgroundAnalysisWhen(30_000)).toContain('停下 30 秒后开始');
    expect(backgroundAnalysisWhen(30_000)).toContain('运行名额总给你留一个');
    expect(backgroundQuietReason(30_000)).toBe('稿件刚改动过；停下 30 秒后开始。');
    expect(backgroundDriftReason(['模型服务', '工序'])).toBe('登记时定下的「模型服务」、「工序」已经变化，后台分析不会按旧的登记开始；请撤销后重新登记。');
    expect(BACKGROUND_ANALYSIS_NOT_GRANTED.some((line) => line.includes('不超过登记时设下的预算上限'))).toBe(true);
    expect(BACKGROUND_REVOKE_CONSEQUENCES.some((line) => line.includes('不会撤回或改写'))).toBe(true);
  });
});

describe('the 后台分析登记 frames', () => {
  it('accepts the read, 登记 and 撤销登记 with their exact inputs, and refuses anything more', () => {
    const bookId = randomUUID();
    const read = { id: randomUUID(), op: 'inspectBackgroundAnalysisEnrollment', input: { bookId } };
    expect(decodeRequest(frameOf(read))).toEqual(read);
    expect(rejectionFor(frameOf({ ...read, input: { bookId: 'not-a-uuid' } }))).toBeInstanceOf(ProtocolError);
    expect(rejectionFor(frameOf({ ...read, input: { bookId, extra: true } }))).toBeInstanceOf(ProtocolError);
    const enroll = { id: randomUUID(), op: 'enrollBackgroundAnalysis', input: {
      bookId, disclosureDigest: 'a'.repeat(64), startingPoint: 'prospective', scope: { kind: 'book', seriesId: null }, ceilingTokens: 1000,
    } };
    expect(decodeRequest(frameOf(enroll))).toEqual(enroll);
    expect(decodeRequest(frameOf({ ...enroll, input: { ...enroll.input, startingPoint: 'backfill' } }))).toBeDefined();
    expect(decodeRequest(frameOf({ ...enroll, input: { ...enroll.input, scope: { kind: 'series', seriesId: randomUUID() } } }))).toBeDefined();
    expect(decodeRequest(frameOf({ ...enroll, input: { ...enroll.input, scope: { kind: 'all-books', seriesId: null } } }))).toBeDefined();
    const { ceilingTokens: _ceiling, ...withoutCeiling } = enroll.input;
    for (const input of [
      { ...enroll.input, startingPoint: 'everything' },
      { ...enroll.input, startingPoint: null },
      { ...enroll.input, disclosureDigest: 'A'.repeat(64) },
      { ...enroll.input, disclosureDigest: 'a'.repeat(63) },
      { bookId, disclosureDigest: 'a'.repeat(64) },
      // Issue #864: the ceiling is required, a whole number of tokens from 1; the scope names a Series only when it is one.
      withoutCeiling,
      { ...enroll.input, ceilingTokens: 0 },
      { ...enroll.input, ceilingTokens: 1.5 },
      { ...enroll.input, ceilingTokens: '1000' },
      { ...enroll.input, ceilingTokens: 1_000_000_000_000 },
      { ...enroll.input, scope: 'all-books' },
      { ...enroll.input, scope: { kind: 'series', seriesId: null } },
      { ...enroll.input, scope: { kind: 'book', seriesId: randomUUID() } },
      { ...enroll.input, scope: { kind: 'shelf', seriesId: null } },
      { ...enroll.input, scope: { kind: 'book' } },
    ]) expect(rejectionFor(frameOf({ ...enroll, input }))).toBeInstanceOf(ProtocolError);
    const hold = { id: randomUUID(), op: 'holdBackgroundAnalysisEnrollment', input: { bookId, enrollmentId: randomUUID(), hold: 'pause' } };
    expect(decodeRequest(frameOf(hold))).toEqual(hold);
    expect(decodeRequest(frameOf({ ...hold, input: { ...hold.input, hold: 'resume' } }))).toBeDefined();
    for (const input of [{ ...hold.input, hold: 'stop' }, { bookId, enrollmentId: randomUUID() }, { ...hold.input, enrollmentId: 'x' }]) {
      expect(rejectionFor(frameOf({ ...hold, input }))).toBeInstanceOf(ProtocolError);
    }
    const revoke = { id: randomUUID(), op: 'revokeBackgroundAnalysisEnrollment', input: { bookId, enrollmentId: randomUUID() } };
    expect(decodeRequest(frameOf(revoke))).toEqual(revoke);
    expect(rejectionFor(frameOf({ ...revoke, input: { bookId, enrollmentId: 'x' } }))).toBeInstanceOf(ProtocolError);
    expect(rejectionFor(frameOf({ ...revoke, input: { enrollmentId: randomUUID() } }))).toBeInstanceOf(ProtocolError);
  });
});

describe('the 后台分析 block words', () => {
  const instant = (value: string): string => `〈${value}〉`;
  it('reads the state, the Runs started and the history in the editor\'s words', () => {
    expect([BACKGROUND_ENROLL_OPEN, BACKGROUND_REVOKE_OPEN]).toEqual(['登记后台分析…', '撤销登记…']);
    expect(backgroundNextLine({ kind: 'wait', reason: BACKGROUND_PLACE_BUSY })).toBe(`现在：${BACKGROUND_PLACE_BUSY}`);
    expect(backgroundNextLine({ kind: 'start', reason: BACKGROUND_START_SYNC })).toBe(`马上：${BACKGROUND_START_SYNC}`);
    const enrollment = {
      enrollmentId: randomUUID(), enrollmentVersionId: randomUUID(), ordinal: 1, name: '后台分析登记 · 第 1 版', startingPoint: 'prospective' as const,
      startingPointLabel: '只分析登记之后的改动', enrolledBy: '本机编辑' as const, enrolledAt: 'T', stateRecordedAt: 'T', binds: [],
      ceilingTokens: 1000, shareTokens: 1000, scope: { kind: 'book' as const, label: '《甲》这一本书', books: [{ bookId: randomUUID(), title: '甲' }], position: 1 },
    };
    expect(backgroundEnrollmentLine(enrollment, instant)).toBe('后台分析登记 · 第 1 版 · 只分析登记之后的改动 · 本机编辑登记于 〈T〉');
    // Issue #864: the scope and the ceiling each Run is held to.
    expect(backgroundCeilingLine(enrollment)).toBe('范围：《甲》这一本书 · 预算上限 1000 tokens');
    expect(backgroundCeilingLine({ ...enrollment, shareTokens: 333, scope: { ...enrollment.scope, kind: 'series', label: '书系《乙》的 3 本书', position: 2 } }))
      .toBe('范围：书系《乙》的 3 本书 · 预算上限 1000 tokens，本书份额 333 tokens（第 2 本）');
    expect(backgroundCeilingLine({ ...enrollment, ceilingTokens: null, shareTokens: null })).toBe('范围：《甲》这一本书 · 这份登记没有预算上限');
    expect(backgroundSkippedLine([{ bookId: randomUUID(), title: '丙', reason: '登记之后稿件还没有改动。' }])).toBe('这次跳过：《丙》（登记之后稿件还没有改动。）');
    expect([BACKGROUND_PAUSE, BACKGROUND_RESUME]).toEqual(['暂停', '续行']);
    expect([backgroundCeilingOf('1000', 3, 10_000), backgroundCeilingOf(' 7 ', 1, 10), backgroundCeilingOf('2', 3, 10), backgroundCeilingOf('1e3', 1, 10_000),
      backgroundCeilingOf('', 1, 10), backgroundCeilingOf('11', 1, 10), backgroundCeilingOf('-5', 1, 10)]).toEqual([1000, 7, null, null, null, null, null]);
    expect(backgroundSharePreview(500, [{ title: '甲' }])).toBe('每次后台分析最多用 500 tokens，达到就停下。');
    expect(backgroundSharePreview(1000, [{ title: '甲' }, { title: '乙' }, { title: '丙' }])).toBe('3 本书各 333 tokens，第一本《甲》334 tokens：每本书的每次后台分析最多用它那一份。');
    expect(backgroundSharePreview(999, [{ title: '甲' }, { title: '乙' }, { title: '丙' }])).toBe('3 本书各 333 tokens：每本书的每次后台分析最多用它那一份。');
    expect(backgroundStartedLine({ taskIntentId: randomUUID(), modeLabel: '同步到当前稿件', enrollmentOrdinal: 1, authorizedAt: 'A' }, instant))
      .toBe('同步到当前稿件 · 按第 1 版登记 · 授权于 〈A〉');
    expect(backgroundStartedLine({ taskIntentId: randomUUID(), modeLabel: '首次基线分析', enrollmentOrdinal: null, authorizedAt: 'A' }, instant))
      .toBe('首次基线分析 · 按另一份数据的登记 · 授权于 〈A〉');
    expect(backgroundHistoryLine({ state: 'revoked', stateLabel: '已撤销', ordinal: 1, recordedAt: 'R' }, instant)).toBe('第 1 版 · 已撤销 · 〈R〉');
    expect(backgroundStartedMoreLine(3)).toBe('还有 3 项更早的。');
    // When AI7 last looked changes on every look and alone never redraws the block; what it found does.
    const projection = { state: 'active', next: { kind: 'none', reason: 'r' }, lastLook: { at: 'T1', kind: 'none', reason: 'r' } } as unknown as BackgroundAnalysisEnrollmentProjection;
    const later = { ...projection, lastLook: { at: 'T2', kind: 'none', reason: 'r' } } as BackgroundAnalysisEnrollmentProjection;
    const changed = { ...projection, lastLook: { at: 'T2', kind: 'wait', reason: 'w' } } as BackgroundAnalysisEnrollmentProjection;
    expect(backgroundChangeKey(later)).toBe(backgroundChangeKey(projection));
    expect(backgroundChangeKey(changed)).not.toBe(backgroundChangeKey(projection));
    expect(backgroundChangeKey({ ...projection, lastLook: null } as BackgroundAnalysisEnrollmentProjection)).not.toBe(backgroundChangeKey(projection));
    expect(backgroundLookLine({ at: 'L', kind: 'wait', reason: BACKGROUND_PLACE_BUSY }, instant)).toBe(`AI7 上次查看：〈L〉 · ${BACKGROUND_PLACE_BUSY}`);
    expect(backgroundNotStartedLine({ at: 'N', reason: '后台分析这次没有开始：已撤销' }, instant)).toBe('后台分析这次没有开始：已撤销（〈N〉）');
  });

  it('admits the J-09 quiet period only as whole milliseconds from 1 s to 30 s', () => {
    expect([parseBackgroundQuietMs('1000'), parseBackgroundQuietMs('3000'), parseBackgroundQuietMs('30000')]).toEqual([1_000, 3_000, 30_000]);
    for (const value of ['999', '30001', '0', '03000', '3000.5', '-3000', ' 3000', '3e3', '']) expect([value, parseBackgroundQuietMs(value)]).toEqual([value, null]);
  });
});
