import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';
import { durationWords, taskEstimate, withMeasuredDuration } from '../../src/service/task-estimate.js';
import { runStretches, TaskWorkReader, unionWork } from '../../src/service/task-work.js';

// 用时 and 预计 (Issue #1670): the working-time rule over recorded run states, the union of a review's Runs, and the estimate's words.
const T0 = Date.parse('2026-11-20T08:00:00.000Z');
const at = (minutes: number): string => new Date(T0 + minutes * 60_000).toISOString();
const row = (state: string, minutes: number, reconciled = false) => ({ state, at: at(minutes), reconciled });

describe('runStretches', () => {
  it('counts executing through pausing and cancelling, never a queue wait, a pause or a wait for the editor', () => {
    const stretches = runStretches([row('authorized', 0), row('admitted', 5), row('executing', 6), row('executing', 7), row('pausing', 9), row('paused', 10),
      row('admitted', 30), row('executing', 31), row('awaiting-clarification', 33), row('executing', 50), row('completed', 52)], () => []);
    expect(stretches).toEqual([{ from: T0 + 6 * 60_000, to: T0 + 10 * 60_000 }, { from: T0 + 31 * 60_000, to: T0 + 33 * 60_000 },
      { from: T0 + 50 * 60_000, to: T0 + 52 * 60_000 }]);
    expect(unionWork(stretches)).toEqual({ workedMs: 8 * 60_000, workingSince: null });
  });

  it('ends a stretch a restart closed at the Run\'s last own instant, and a second restart adds nothing', () => {
    const own = [at(8), at(500)];
    const rows = [row('executing', 6), row('executing', 7), row('resumable', 300, true), row('resumable', 600, true)];
    expect(runStretches(rows, () => own)).toEqual([{ from: T0 + 6 * 60_000, to: T0 + 8 * 60_000 }]);
    // `cancelled` after `cancelling`, written at the next start without a mark, is capped the same way.
    expect(runStretches([row('executing', 0), row('cancelling', 3), row('cancelled', 240)], () => [at(0), at(3)])).toEqual([{ from: T0, to: T0 + 3 * 60_000 }]);
    // With nothing the Run recorded after its stretch began, the closed stretch counts nothing: the conservative reading.
    expect(runStretches([row('executing', 0), row('resumable', 300, true)], () => [at(301)])).toEqual([{ from: T0, to: T0 }]);
    // An open stretch stays open: the reader adds now − workingSince.
    expect(unionWork(runStretches([row('executing', 0), row('paused', 2), row('executing', 10)], () => []))).toEqual({ workedMs: 2 * 60_000, workingSince: T0 + 10 * 60_000 });
  });
});

describe('a stretch left open across a restart', () => {
  it('is under way only if the Run recorded something of its own in this process; else it ends at its last own instant (#1670)', () => {
    const rows = [row('executing', 0), row('cancelling', 3)];
    const processStart = T0 + 300 * 60_000;
    // Left 正在取消 when AI7 closed, nothing finishes it at the next start: its figure stops where the Run stopped recording.
    expect(runStretches(rows, () => [at(0), at(2), at(3)], processStart)).toEqual([{ from: T0, to: T0 + 3 * 60_000 }]);
    // The same stretch, continued in this process, is under way.
    expect(runStretches(rows, () => [at(0), at(3), at(301)], processStart)).toEqual([{ from: T0, to: null }]);
  });
});

describe('the boundary of this process', () => {
  it('is the oldest store open on the database, and a new one once every store closed (#1670)', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE analysis_run_records (run_record_id TEXT, task_intent_id TEXT);
      CREATE TABLE analysis_run_states (run_record_id TEXT, sequence INTEGER, state TEXT, recorded_at TEXT, canonical_json TEXT);
      CREATE TABLE analysis_unit_checkpoints (run_record_id TEXT, recorded_at TEXT, canonical_json TEXT, sha256 TEXT);
      CREATE TABLE analysis_clarification_requests (raised_at TEXT, sha256 TEXT);
      CREATE TABLE analysis_task_outcomes (task_intent_id TEXT, recorded_at TEXT, canonical_json TEXT, sha256 TEXT);
      CREATE TABLE analysis_harness_spans (attempt_id TEXT, recorded_at TEXT);
      CREATE TABLE analysis_execution_attempts (attempt_id TEXT, run_record_id TEXT)`);
    db.prepare('INSERT INTO analysis_run_records VALUES (?, ?)').run('run', 'task');
    db.prepare('INSERT INTO analysis_run_states VALUES (?, ?, ?, ?, ?)').run('run', 1, 'executing', at(10), '{}');
    const owners = { reviewTaskIntents: () => [], reviewModelLabel: () => null };
    const path = `memory-${Math.random()}/ai7.sqlite`;
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(T0);
      const first = new TaskWorkReader(db, owners, path);
      vi.setSystemTime(T0 + 60 * 60_000);
      const second = new TaskWorkReader(db, owners, path);
      // The Run began in the first store's lifetime: both read it under way.
      expect([first.ofTaskIntents(['task'])!.workingSince, second.ofTaskIntents(['task'])!.workingSince]).toEqual([at(10), at(10)]);
      first.release(); second.release();
      // Every store closed, then one opened again: a restart, and the stretch left open is not under way.
      const reopened = new TaskWorkReader(db, owners, path);
      expect(reopened.ofTaskIntents(['task'])).toEqual({ workedMs: 0, workingSince: null, finished: null });
      reopened.release();
    } finally { vi.useRealTimers(); db.close(); }
  });
});

describe('unionWork', () => {
  it('counts overlapping, nested and touching intervals once, and clips closed time at the open start', () => {
    const m = (minutes: number) => T0 + minutes * 60_000;
    expect(unionWork([{ from: m(0), to: m(10) }, { from: m(5), to: m(15) }]).workedMs).toBe(15 * 60_000);
    expect(unionWork([{ from: m(0), to: m(20) }, { from: m(5), to: m(10) }]).workedMs).toBe(20 * 60_000);
    expect(unionWork([{ from: m(0), to: m(10) }, { from: m(10), to: m(12) }]).workedMs).toBe(12 * 60_000);
    expect(unionWork([{ from: m(0), to: m(10) }, { from: m(4), to: null }, { from: m(8), to: null }])).toEqual({ workedMs: 4 * 60_000, workingSince: m(4) });
    expect(unionWork([])).toEqual({ workedMs: 0, workingSince: null });
  });

  it('reads two Runs of one review that worked side by side once, from their run-state rows', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE analysis_run_records (run_record_id TEXT, task_intent_id TEXT);
      CREATE TABLE analysis_run_states (run_record_id TEXT, sequence INTEGER, state TEXT, recorded_at TEXT, canonical_json TEXT)`);
    const states: Array<[string, string, number]> = [['a', 'executing', 0], ['a', 'paused', 10], ['b', 'executing', 4], ['b', 'paused', 14]];
    for (const [run, state, minutes] of states) db.prepare('INSERT INTO analysis_run_states VALUES (?, ?, ?, ?, ?)').run(run, minutes, state, at(minutes), '{}');
    db.prepare('INSERT INTO analysis_run_records VALUES (?, ?), (?, ?)').run('a', 'category-a', 'b', 'category-b');
    const reader = new TaskWorkReader(db, { reviewTaskIntents: () => [{ taskIntentId: 'category-a', synthesis: false }, { taskIntentId: 'category-b', synthesis: false }], reviewModelLabel: () => null });
    expect(reader.ofReview('review')).toEqual({ workedMs: 14 * 60_000, workingSince: null, finished: null });
    db.close();
  });
});

describe('the measured duration', () => {
  it('samples a review by its completion in the last 7 days, never by when it was created (#1670)', () => {
    const now = Date.parse('2026-11-22T08:00:00.000Z');
    const day = 86_400_000;
    const db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE review_runs (review_run_id TEXT, created_at TEXT, canonical_json TEXT);
      CREATE TABLE analysis_task_outcomes (task_intent_id TEXT, classification TEXT, recorded_at TEXT, canonical_json TEXT);
      CREATE TABLE analysis_run_records (run_record_id TEXT, task_intent_id TEXT);
      CREATE TABLE analysis_run_states (run_record_id TEXT, sequence INTEGER, state TEXT, recorded_at TEXT, canonical_json TEXT)`);
    const reader = new TaskWorkReader(db, { reviewTaskIntents: () => [{ taskIntentId: 'category', synthesis: false }], reviewModelLabel: () => null });
    const completedAgo = (ms: number) => {
      for (const table of ['review_runs', 'analysis_task_outcomes', 'analysis_run_records', 'analysis_run_states']) db.exec(`DELETE FROM ${table}`);
      db.prepare('INSERT INTO review_runs VALUES (?, ?, ?)').run('review', new Date(now - 15 * day).toISOString(), JSON.stringify({ categories: [{ task: { taskIntentId: 'category' } }] }));
      db.prepare('INSERT INTO analysis_task_outcomes VALUES (?, ?, ?, ?)').run('category', 'completed', new Date(now - ms).toISOString(), '{}');
      db.prepare('INSERT INTO analysis_run_records VALUES (?, ?)').run('run', 'category');
      db.prepare('INSERT INTO analysis_run_states VALUES (?, ?, ?, ?, ?)').run('run', 1, 'executing', new Date(now - ms - 60_000).toISOString(), JSON.stringify({ unitsTotal: 1 }));
      db.prepare('INSERT INTO analysis_run_states VALUES (?, ?, ?, ?, ?)').run('run', 2, 'completed', new Date(now - ms).toISOString(), '{}');
      return reader.perPartMs('review-run', now);
    };
    expect([completedAgo(60_000), completedAgo(8 * day)]).toEqual([60_000, null]);
    db.close();
  });
});

describe('the estimate sentence', () => {
  it('names parts and the fewest requests, the plan\'s own reasons for more in a fixed order, the ceiling, and no token figure', () => {
    expect(taskEstimate({ parts: 12, fewestRequests: 13, more: ['reflection', 'retry', 'web-search'], ceiling: true }).sentence)
      .toBe('预计读 12 个部分，至少 13 次模型调用（重试、联网检索或复盘时会更多），用量到上限后不再发送新的请求；用时暂无可靠估计。');
    expect(taskEstimate({ parts: 3, fewestRequests: 1, verb: '改' }).sentence).toBe('预计改 3 个部分，至少 1 次模型调用；用时暂无可靠估计。');
    expect(taskEstimate({ parts: 0, fewestRequests: 0, local: 'local-check' }).sentence).toBe('只在本机检查，不调用模型。');
  });

  it('gives a duration only when measured, in plain minutes and hours', () => {
    expect(['不到 1 分钟', '约 6 分钟', '约 59 分钟', '约 1 小时 20 分钟', '约 2 小时'])
      .toEqual([59_000, 5.2 * 60_000, 59 * 60_000, 72 * 60_000, 115 * 60_000].map(durationWords));
    const plan = { estimate: taskEstimate({ parts: 12, fewestRequests: 13 }) };
    expect(withMeasuredDuration(plan, null)).toBe(plan);
    expect(withMeasuredDuration(plan, 30_000).estimate).toMatchObject({ durationMs: 360_000, sentence: '预计读 12 个部分，至少 13 次模型调用；按最近同类任务，约 6 分钟。' });
  });
});
