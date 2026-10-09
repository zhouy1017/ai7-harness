import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ProtocolError, decodeRequest } from '../../src/service/request-frames.js';
import {
  BACKGROUND_ANALYSIS_NOT_GRANTED,
  BACKGROUND_ATTEMPTED,
  BACKGROUND_CURRENT,
  BACKGROUND_DEVELOPER_LIVE,
  BACKGROUND_FACTS_UNREADABLE,
  BACKGROUND_NOT_ENROLLED,
  BACKGROUND_NOT_MOVED,
  BACKGROUND_NO_ROUTE,
  BACKGROUND_PLACE_BUSY,
  BACKGROUND_REVOKED,
  BACKGROUND_REVOKE_CONSEQUENCES,
  BACKGROUND_START_FIRST,
  BACKGROUND_START_SYNC,
  BACKGROUND_STARTING_POINT_LABELS,
  BACKGROUND_STATE_LABELS,
  BACKGROUND_TASK_PREPARED,
  BACKGROUND_TASK_RUNNING,
  backgroundAnalysisDecision,
  backgroundAnalysisWhen,
  backgroundDriftReason,
  backgroundEnrollmentName,
  backgroundQuietReason,
  type BackgroundAnalysisFacts,
} from '../../src/service/background-analysis-enrollments.js';
import {
  BACKGROUND_ENROLL_OPEN,
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
  developerLive: false,
  routeExecutable: true,
  drift: [],
  taskUnfinished: null,
  analysis: 'stale',
  startingPoint: 'prospective',
  movedSinceEnrollment: true,
  sinceLastEditMs: 60_000,
  attemptedAtThisText: false,
  placeFree: true,
  quietMs: 30_000,
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
      [{ enrollment: 'revoked' }, 'stopped', BACKGROUND_REVOKED],
      [{ developerLive: true }, 'stopped', BACKGROUND_DEVELOPER_LIVE],
      [{ routeExecutable: false }, 'stopped', BACKGROUND_NO_ROUTE],
      [{ drift: null }, 'stopped', BACKGROUND_FACTS_UNREADABLE],
      [{ drift: ['模型服务'] }, 'stopped', backgroundDriftReason(['模型服务'])],
      [{ taskUnfinished: 'run' }, 'wait', BACKGROUND_TASK_RUNNING],
      [{ taskUnfinished: 'prepared' }, 'wait', BACKGROUND_TASK_PREPARED],
      [{ analysis: 'current' }, 'none', BACKGROUND_CURRENT],
      [{ movedSinceEnrollment: false }, 'none', BACKGROUND_NOT_MOVED],
      [{ attemptedAtThisText: true }, 'wait', BACKGROUND_ATTEMPTED],
      [{ sinceLastEditMs: 29_999 }, 'wait', backgroundQuietReason(30_000)],
      [{ placeFree: false }, 'wait', BACKGROUND_PLACE_BUSY],
    ];
    for (const [facts, kind, reason] of cases) expect(backgroundAnalysisDecision({ ...READY, ...facts }), reason).toEqual({ kind, reason });
    // Revoked outranks everything after it: a revoked Enrollment under developer-live says it is revoked.
    expect(backgroundAnalysisDecision({ ...READY, enrollment: 'revoked', developerLive: true, placeFree: false }).reason).toBe(BACKGROUND_REVOKED);
    // An unfinished Task outranks a current analysis; a prospective Enrollment over an unmoved text never waits on the clock.
    expect(backgroundAnalysisDecision({ ...READY, taskUnfinished: 'run', analysis: 'current' }).reason).toBe(BACKGROUND_TASK_RUNNING);
    expect(backgroundAnalysisDecision({ ...READY, movedSinceEnrollment: false, sinceLastEditMs: 0 }).reason).toBe(BACKGROUND_NOT_MOVED);
  });

  it('words what an Enrollment is, binds, never does, and keeps when revoked', () => {
    expect(BACKGROUND_STATE_LABELS).toEqual({ none: '未登记', active: '已登记', revoked: '已撤销' });
    expect(BACKGROUND_STARTING_POINT_LABELS).toEqual({ prospective: '只分析登记之后的改动', backfill: '现在也分析当前稿件' });
    expect(backgroundEnrollmentName(2)).toBe('后台分析登记 · 第 2 版');
    expect(backgroundAnalysisWhen(30_000)).toContain('停下 30 秒后开始');
    expect(backgroundQuietReason(30_000)).toBe('稿件刚改动过；停下 30 秒后开始。');
    expect(backgroundDriftReason(['模型服务', '工序'])).toBe('登记时定下的「模型服务」、「工序」已经变化，后台分析不会按旧的登记开始；请撤销后重新登记。');
    expect(BACKGROUND_ANALYSIS_NOT_GRANTED.some((line) => line.includes('开发者实时模式下不开始'))).toBe(true);
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
    const enroll = { id: randomUUID(), op: 'enrollBackgroundAnalysis', input: { bookId, disclosureDigest: 'a'.repeat(64), startingPoint: 'prospective' } };
    expect(decodeRequest(frameOf(enroll))).toEqual(enroll);
    expect(decodeRequest(frameOf({ ...enroll, input: { ...enroll.input, startingPoint: 'backfill' } }))).toBeDefined();
    for (const input of [
      { ...enroll.input, startingPoint: 'everything' },
      { ...enroll.input, startingPoint: null },
      { ...enroll.input, disclosureDigest: 'A'.repeat(64) },
      { ...enroll.input, disclosureDigest: 'a'.repeat(63) },
      { bookId, disclosureDigest: 'a'.repeat(64) },
      { ...enroll.input, scope: 'all-books' },
    ]) expect(rejectionFor(frameOf({ ...enroll, input }))).toBeInstanceOf(ProtocolError);
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
    expect(backgroundEnrollmentLine({
      enrollmentId: randomUUID(), enrollmentVersionId: randomUUID(), ordinal: 1, name: '后台分析登记 · 第 1 版', startingPoint: 'prospective',
      startingPointLabel: '只分析登记之后的改动', enrolledBy: '本机编辑', enrolledAt: 'T', stateRecordedAt: 'T', binds: [],
    }, instant)).toBe('后台分析登记 · 第 1 版 · 只分析登记之后的改动 · 本机编辑登记于 〈T〉');
    expect(backgroundStartedLine({ taskIntentId: randomUUID(), modeLabel: '同步到当前稿件', enrollmentOrdinal: 1, authorizedAt: 'A' }, instant))
      .toBe('同步到当前稿件 · 按第 1 版登记 · 授权于 〈A〉');
    expect(backgroundStartedLine({ taskIntentId: randomUUID(), modeLabel: '首次基线分析', enrollmentOrdinal: null, authorizedAt: 'A' }, instant))
      .toBe('首次基线分析 · 按另一份数据的登记 · 授权于 〈A〉');
    expect(backgroundHistoryLine({ state: 'revoked', stateLabel: '已撤销', ordinal: 1, recordedAt: 'R' }, instant)).toBe('第 1 版 · 已撤销 · 〈R〉');
    expect(backgroundStartedMoreLine(3)).toBe('还有 3 项更早的。');
  });
});
