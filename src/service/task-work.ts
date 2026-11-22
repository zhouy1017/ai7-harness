import type { DatabaseSync, SQLOutputValue, StatementSync } from 'node:sqlite';
import { launchedTaskModelLabels } from './editorial-mark-source.js';
import { withMeasuredDuration } from './task-estimate.js';
import type { TaskPlanKind, TaskPlanProjection, TaskWorkProjection } from '../shared/protocol/task-plan.js';
import type { TaskLaunchPreviewProjection } from '../shared/runtime-execution-config.js';

type SqlRow = Record<string, SQLOutputValue>;

/**
 * 用时 (Issue #1670): one working time for every Task, read from the run states every ledger kind already records — nothing new
 * is written. A stretch opens at each entry into `executing` and stays open through `pausing` and `cancelling` (the step in flight
 * still works); it closes at the next recorded state of any other kind. A stretch that a restart closed — a reconciliation row,
 * or `cancelled` after `cancelling`, which the next start writes without a mark — ends at the last instant the Run itself recorded
 * inside it (its own state rows, unit checkpoints and request spans), so the time AI7 was closed never counts.
 */
export interface WorkInterval { readonly from: number; readonly to: number | null }

const WORKING = new Set(['executing', 'pausing', 'cancelling']);
const TERMINAL = new Set(['completed', 'completed-with-gaps', 'failed', 'interrupted', 'cancelled']);
const COMPLETED = ['completed', 'completed-with-gaps'];
const WEEK_MS = 7 * 86_400_000;

export interface RunStateRow { readonly state: string; readonly at: string; readonly reconciled: boolean }

/** The working stretches of one Run, from its state rows in sequence order; `ownInstants` is read only for a capped close. */
export function runStretches(rows: ReadonlyArray<RunStateRow>, ownInstants: () => ReadonlyArray<string>): WorkInterval[] {
  const stretches: WorkInterval[] = [];
  let open: { from: number; index: number } | null = null;
  rows.forEach((row, index) => {
    if (open === null) {
      if (row.state === 'executing') open = { from: Date.parse(row.at), index };
      return;
    }
    if (WORKING.has(row.state)) return;
    const capped = row.reconciled || row.state === 'cancelled' && rows[index - 1]?.state === 'cancelling';
    const closing = Date.parse(row.at);
    let to = closing;
    if (capped) {
      const from = open.from;
      to = [...rows.slice(open.index, index).map((entry) => entry.at), ...ownInstants()]
        .map(Date.parse).filter((at) => at >= from && at < closing).reduce((latest, at) => Math.max(latest, at), from);
    }
    stretches.push({ from: open.from, to });
    open = null;
  });
  if (open !== null) stretches.push({ from: (open as { from: number }).from, to: null });
  return stretches;
}

/**
 * The wall time during which at least one interval was working: the review's categories and synthesis side by side count once.
 * An open interval runs to now, so the figure is `workedMs` (the closed time before the earliest open start) plus now − that start.
 */
export function unionWork(intervals: ReadonlyArray<WorkInterval>): { workedMs: number; workingSince: number | null } {
  const opens = intervals.filter((entry) => entry.to === null).map((entry) => entry.from);
  const since = opens.length === 0 ? null : Math.min(...opens);
  const closed = intervals.flatMap((entry) => entry.to === null ? [] : [{ from: entry.from, to: since === null ? entry.to : Math.min(entry.to, since) }])
    .filter((entry) => entry.to > entry.from).sort((left, right) => left.from - right.from);
  let workedMs = 0, end = -Infinity;
  for (const entry of closed) {
    if (entry.from >= end) { workedMs += entry.to - entry.from; end = entry.to; }
    else if (entry.to > end) { workedMs += entry.to - end; end = entry.to; }
  }
  return { workedMs, workingSince: since };
}

function ids(values: ReadonlyArray<string>): string { return values.map(() => '?').join(','); }

interface RunReading { readonly intervals: WorkInterval[]; readonly last: string; readonly parts: number | null }

/** The owners the reading needs: the Review Run's Task Intents, its categories' and every synthesis attempt's (`#runUsage`'s set). */
export interface TaskWorkOwners {
  reviewTaskIntents(reviewRunId: string): ReadonlyArray<{ readonly taskIntentId: string; readonly synthesis: boolean }>;
  /** The Review Run's model label, as its row reads it. */
  reviewModelLabel(reviewRunId: string): string | null;
}

export class TaskWorkReader {
  readonly #db: DatabaseSync;
  readonly #owners: TaskWorkOwners;
  readonly #statements = new Map<string, StatementSync>();

  constructor(db: DatabaseSync, owners: TaskWorkOwners) {
    this.#db = db;
    this.#owners = owners;
  }

  /** Every overview read asks the same few questions of each row: each is compiled once. */
  #prepare(sql: string): StatementSync {
    let statement = this.#statements.get(sql);
    if (statement === undefined) { statement = this.#db.prepare(sql); this.#statements.set(sql, statement); }
    return statement;
  }

  /**
   * Every Run of these Task Intents — its stretches, its latest state and the parts it read — in the order the Runs were recorded,
   * by one read over the run records and their states.
   */
  runs(taskIntentIds: ReadonlyArray<string>, withParts = false): Array<RunReading & { readonly taskIntentId: string }> {
    if (taskIntentIds.length === 0) return [];
    // Only a closing row can carry the reconciliation mark; the many executing rows of request evidence are not parsed for it.
    const rows = this.#prepare(`SELECT r.task_intent_id, s.run_record_id, s.state, s.recorded_at,
      CASE WHEN s.state IN ('executing', 'pausing', 'cancelling') THEN NULL ELSE json_extract(s.canonical_json, '$.reconciled') END reconciled,
      ${withParts ? "CASE WHEN s.state = 'executing' THEN coalesce(json_extract(s.canonical_json, '$.unitsRecomputed'), json_extract(s.canonical_json, '$.unitsTotal')) END" : 'NULL'} parts
      FROM analysis_run_records r JOIN analysis_run_states s ON s.run_record_id = r.run_record_id
      WHERE r.task_intent_id IN (${ids(taskIntentIds)}) ORDER BY r.rowid, s.sequence`).all(...taskIntentIds) as SqlRow[];
    const byRun = new Map<string, SqlRow[]>();
    for (const row of rows) {
      const held = byRun.get(String(row.run_record_id));
      if (held === undefined) byRun.set(String(row.run_record_id), [row]); else held.push(row);
    }
    return [...byRun].map(([runRecordId, states]) => {
      const intervals = runStretches(states.map((row) => ({ state: String(row.state), at: String(row.recorded_at), reconciled: row.reconciled === 1 })),
        () => (this.#prepare(`SELECT recorded_at FROM analysis_unit_checkpoints WHERE run_record_id = ?1
          UNION ALL SELECT s.recorded_at FROM analysis_harness_spans s JOIN analysis_execution_attempts a ON a.attempt_id = s.attempt_id WHERE a.run_record_id = ?1`)
          .all(runRecordId) as SqlRow[]).map((row) => String(row.recorded_at)));
      const executing = states.find((row) => row.state === 'executing' && typeof row.parts === 'number');
      return { taskIntentId: String(states[0]!.task_intent_id), intervals, last: String(states.at(-1)!.state), parts: executing === undefined ? null : Number(executing.parts) };
    });
  }

  /**
   * The working time of the Runs of these Task Intents, with the requests and model once every latest Run ended; `null` with no Run.
   * A row that already reads its model label hands it in, so the label is the row's own.
   */
  ofTaskIntents(taskIntentIds: ReadonlyArray<string>, modelLabel?: string | null): TaskWorkProjection | null {
    const readings = this.runs(taskIntentIds);
    if (readings.length === 0) return null;
    const latest = new Map(readings.map((reading) => [reading.taskIntentId, reading]));
    const work = unionWork(readings.flatMap((reading) => reading.intervals));
    const ended = work.workingSince === null && [...latest.values()].every((reading) => TERMINAL.has(reading.last));
    return { workedMs: work.workedMs, workingSince: work.workingSince === null ? null : new Date(work.workingSince).toISOString(),
      finished: ended ? { requests: this.#requests(taskIntentIds), modelLabel: modelLabel === undefined ? this.#modelLabel(taskIntentIds) : modelLabel } : null };
  }

  ofReview(reviewRunId: string, modelLabel?: string | null): TaskWorkProjection | null {
    const work = this.ofTaskIntents(this.#owners.reviewTaskIntents(reviewRunId).map((entry) => entry.taskIntentId), null);
    return work?.finished == null ? work : { ...work, finished: { ...work.finished, modelLabel: modelLabel === undefined ? this.#owners.reviewModelLabel(reviewRunId) : modelLabel } };
  }

  /** A dialogue's attempts, as the overview read them: each settled one from its start to its settlement; the one under way is open. */
  ofDialogue(dialogueId: string, live: (attemptId: string) => boolean, modelLabel: string | null): TaskWorkProjection | null {
    const attempts = this.#prepare(`SELECT a.attempt_id, a.created_at, o.settled_at FROM dialogue_attempts a
      LEFT JOIN dialogue_attempt_outcomes o ON o.attempt_id = a.attempt_id WHERE a.dialogue_id = ? ORDER BY a.ordinal`).all(dialogueId) as SqlRow[];
    if (attempts.length === 0) return null;
    const intervals = attempts.flatMap((row): WorkInterval[] => row.settled_at !== null
      ? [{ from: Date.parse(String(row.created_at)), to: Math.max(Date.parse(String(row.created_at)), Date.parse(String(row.settled_at))) }]
      : live(String(row.attempt_id)) ? [{ from: Date.parse(String(row.created_at)), to: null }] : []);
    const work = unionWork(intervals);
    const ended = work.workingSince === null && attempts.at(-1)!.settled_at !== null;
    return { workedMs: work.workedMs, workingSince: work.workingSince === null ? null : new Date(work.workingSince).toISOString(),
      // A dialogue attempt records no request count of its own: each attempt is one request, as the overview counted them.
      finished: ended ? { requests: attempts.length, modelLabel } : null };
  }

  /** The Task a plan names: the Task Intent of a ledger kind, the Review Run, or none for J-03's record-only fixed task. */
  ofPlan(kind: TaskPlanKind, ref: string | null): TaskWorkProjection | null {
    if (ref === null || kind === 'fixed-task') return null;
    return kind === 'review-run' ? this.ofReview(ref) : this.ofTaskIntents([ref]);
  }

  /** The plan as every read gives it: its working time, and its estimate with a duration once one is measured. */
  planRead(plan: TaskPlanProjection, now = Date.now()): TaskPlanProjection {
    return withMeasuredDuration({ ...plan, work: this.ofPlan(plan.kind, plan.ref) }, this.perPartMs(this.#kindOf(plan.kind, plan.ref), now));
  }

  /** A launch preview's estimate, measured on the ledger kind it would launch, or on reviews. */
  previewRead(preview: TaskLaunchPreviewProjection, kind: string, now = Date.now()): TaskLaunchPreviewProjection {
    return withMeasuredDuration(preview, this.perPartMs(kind, now));
  }

  #kindOf(kind: TaskPlanKind, ref: string | null): string | null {
    if (kind === 'review-run') return 'review-run';
    if (ref === null || kind === 'fixed-task') return null;
    const row = this.#prepare('SELECT kind FROM analysis_task_intents WHERE task_intent_id = ?').get(ref) as SqlRow | undefined;
    return row === undefined ? null : String(row.kind);
  }

  /**
   * The measured time per part of the same kind's Tasks completed on this machine in the last 7 days — the rule
   * `estimateTaskStarts` applies, on 用时; `null` when none was measured. One read of the kind's outcomes, one of their run states.
   */
  perPartMs(kind: string | null, now = Date.now()): number | null {
    if (kind === null) return null;
    const since = new Date(now - WEEK_MS).toISOString();
    const samples: Array<{ taskIntentIds: string[]; partsOf: string[] }> = kind === 'review-run'
      ? (this.#prepare('SELECT review_run_id FROM review_runs WHERE created_at >= ?').all(new Date(now - 2 * WEEK_MS).toISOString()) as SqlRow[])
        .flatMap((row) => {
          const tasks = this.#owners.reviewTaskIntents(String(row.review_run_id));
          const outcomes = tasks.length === 0 ? [] : this.#prepare(`SELECT classification, recorded_at FROM analysis_task_outcomes
            WHERE task_intent_id IN (${ids(tasks.map((task) => task.taskIntentId))})`).all(...tasks.map((task) => task.taskIntentId)) as SqlRow[];
          const done = outcomes.length > 0 && tasks.filter((task) => !task.synthesis).length <= outcomes.length &&
            outcomes.every((outcome) => COMPLETED.includes(String(outcome.classification))) && outcomes.some((outcome) => String(outcome.recorded_at) >= since);
          return done ? [{ taskIntentIds: tasks.map((task) => task.taskIntentId), partsOf: tasks.filter((task) => !task.synthesis).map((task) => task.taskIntentId) }] : [];
        })
      : (this.#prepare(`SELECT o.task_intent_id FROM analysis_task_outcomes o JOIN analysis_task_intents t ON t.task_intent_id = o.task_intent_id
          WHERE t.kind = ? AND o.recorded_at >= ? AND o.classification IN ('completed', 'completed-with-gaps')`).all(kind, since) as SqlRow[])
        .map((row) => ({ taskIntentIds: [String(row.task_intent_id)], partsOf: [String(row.task_intent_id)] }));
    if (samples.length === 0) return null;
    const all = [...new Set(samples.flatMap((sample) => sample.taskIntentIds))];
    const readings = this.runs(all, true);
    const runsOf = (taskIntentIds: ReadonlyArray<string>) => readings.filter((reading) => taskIntentIds.includes(reading.taskIntentId));
    const rates = samples.flatMap((sample) => {
      const worked = unionWork(runsOf(sample.taskIntentIds).flatMap((reading) => reading.intervals));
      const parts = runsOf(sample.partsOf).reduce((total, reading) => total + (reading.parts ?? 0), 0);
      return worked.workingSince === null && worked.workedMs > 0 && parts > 0 ? [worked.workedMs / parts] : [];
    });
    return rates.length === 0 ? null : rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
  }

  #requests(taskIntentIds: ReadonlyArray<string>): number | null {
    const rows = this.#prepare(`SELECT json_extract(canonical_json, '$.report.usagePerStage') usage FROM analysis_task_outcomes
      WHERE task_intent_id IN (${ids(taskIntentIds)})`).all(...taskIntentIds) as SqlRow[];
    let requests: number | null = null;
    for (const row of rows) {
      if (typeof row.usage !== 'string') continue;
      const stages = JSON.parse(row.usage) as Record<string, { requests?: unknown }>;
      requests = (requests ?? 0) + Object.values(stages).reduce((sum, stage) => sum + (typeof stage?.requests === 'number' ? stage.requests : 0), 0);
    }
    return requests;
  }

  #modelLabel(taskIntentIds: ReadonlyArray<string>): string | null {
    for (const taskIntentId of taskIntentIds) {
      const label = launchedTaskModelLabels(this.#db, taskIntentId).modelLabel;
      if (label !== undefined) return label;
    }
    return null;
  }
}
