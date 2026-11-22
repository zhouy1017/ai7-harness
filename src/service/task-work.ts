import type { DatabaseSync, SQLOutputValue, StatementSync } from 'node:sqlite';
import { RECOVERED_REDUCTION_REASON, RECOVERED_SAMPLING_MARK, RECOVERED_UNIT_REASON } from './analysis/request-admission-operations.js';
import { launchedTaskModelLabels } from './editorial-mark-source.js';
import { withMeasuredDuration } from './task-estimate.js';
import type { GlobalAttentionItemProjection } from '../shared/protocol.js';
import type { TaskPlanKind, TaskPlanProjection, TaskWorkProjection } from '../shared/protocol/task-plan.js';
import type { TaskLaunchPreviewProjection } from '../shared/runtime-execution-config.js';

type SqlRow = Record<string, SQLOutputValue>;

/**
 * 用时 (Issue #1670): one working time for every Task, read from what every ledger kind already records — nothing new is written.
 * A stretch opens at each entry into `executing` and stays open through `pausing` and `cancelling` (the step in flight still works);
 * it closes at the next recorded state of any other kind. A stretch that a restart closed — a reconciliation row, or `cancelled`
 * after `cancelling`, which the next start writes without a mark — ends at the last instant the Run itself recorded inside it, so
 * the time AI7 was closed never counts. What the next start's recovery writes is never one of the Run's own instants: the
 * reconciliation rows, and the discharge of an admitted request (`reconcileRequestAdmissions`), told apart by what it records —
 * its outcome-unknown words, written nowhere else — and a resolution that points at evidence takes that evidence's instant.
 */
export interface WorkInterval { readonly from: number; readonly to: number | null }

const WORKING = new Set(['executing', 'pausing', 'cancelling']);
const TERMINAL = new Set(['completed', 'completed-with-gaps', 'failed', 'interrupted', 'cancelled']);
const WEEK_MS = 7 * 86_400_000;
/** How the next start settles a dialogue attempt AI7 closed under (`reconcileDialogueAttempts`). */
const DIALOGUE_STOPPED_CAUSE = 'SERVICE_STOPPED';

export interface RunStateRow { readonly state: string; readonly at: string; readonly reconciled: boolean }

/**
 * The working stretches of one Run, from its state rows in sequence order; `ownInstants` is read only for a capped close and for
 * a stretch still open. An open stretch is working only if the Run recorded something of its own in this service process (since
 * `processStart`): no execution survives a restart, so a stretch left open across one — a review category left `cancelling`,
 * which nothing finishes at the next start — is closed at its last own instant.
 */
export function runStretches(rows: ReadonlyArray<RunStateRow>, ownInstants: () => ReadonlyArray<string>, processStart: number | null = null): WorkInterval[] {
  const stretches: WorkInterval[] = [];
  let open: number | null = null;
  rows.forEach((row, index) => {
    if (open === null) {
      if (row.state === 'executing') open = Date.parse(row.at);
      return;
    }
    if (WORKING.has(row.state)) return;
    const closing = Date.parse(row.at), from: number = open;
    const capped = row.reconciled || row.state === 'cancelled' && rows[index - 1]?.state === 'cancelling';
    stretches.push({ from, to: !capped ? closing
      : ownInstants().map(Date.parse).filter((at) => at >= from && at < closing).reduce((latest, at) => Math.max(latest, at), from) });
    open = null;
  });
  if (open !== null) {
    const from: number = open;
    const own = processStart === null ? [] : ownInstants().map(Date.parse).filter((at) => at >= from);
    stretches.push({ from, to: processStart === null || own.some((at) => at >= processStart) ? null : own.reduce((latest, at) => Math.max(latest, at), from) });
  }
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
const iso = (at: number | null): string | null => at === null ? null : new Date(at).toISOString();

interface RunReading { readonly taskIntentId: string; readonly intervals: WorkInterval[]; readonly last: string; readonly parts: number | null }

/** One Task's set of Task Intents, and the model label its row already reads (`undefined`: read it once the Task ended). */
interface IntentSet { readonly taskIntentIds: ReadonlyArray<string>; readonly modelLabel?: string | null; readonly reviewRunId?: string }

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
  /** The instant this service process opened its store: a stretch with nothing of its own since then is not under way. */
  readonly #processStart: number;

  constructor(db: DatabaseSync, owners: TaskWorkOwners, processStart = Date.now()) {
    this.#db = db;
    this.#owners = owners;
    this.#processStart = processStart;
  }

  /** Every overview read asks the same few questions of each Book: each is compiled once. */
  #prepare(sql: string): StatementSync {
    let statement = this.#statements.get(sql);
    if (statement === undefined) { statement = this.#db.prepare(sql); this.#statements.set(sql, statement); }
    return statement;
  }

  /**
   * Every Run of these Task Intents — its stretches, its latest state and the parts it read — in the order the Runs were recorded,
   * by one read over the run records and their states.
   */
  runs(taskIntentIds: ReadonlyArray<string>, withParts = false): RunReading[] {
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
    const stateRows = new Map([...byRun].map(([runRecordId, states]) => [runRecordId,
      states.map((row) => ({ state: String(row.state), at: String(row.recorded_at), reconciled: row.reconciled === 1 }))]));
    // First the Runs whose stretches need their own instants — a capped close, or a stretch still open — then those, all at once.
    const needed = [...stateRows].filter(([, rows]) => {
      let asked = false;
      runStretches(rows, () => { asked = true; return []; }, this.#processStart);
      return asked;
    }).map(([runRecordId]) => runRecordId);
    const own = this.#ownInstants(needed);
    return [...byRun].map(([runRecordId, states]) => {
      const intervals = runStretches(stateRows.get(runRecordId)!, () => own.get(runRecordId) ?? [], this.#processStart);
      const executing = states.find((row) => row.state === 'executing' && typeof row.parts === 'number');
      return { taskIntentId: String(states[0]!.task_intent_id), intervals, last: String(states.at(-1)!.state), parts: executing === undefined ? null : Number(executing.parts) };
    });
  }

  /**
   * The instants each Run itself recorded: its state rows, unit checkpoints and request spans, without the next start's recovery
   * writes — one read of the states and one of the checkpoints and spans for all the Runs. A request resolution takes the instant
   * of the evidence it names; the next start's own discharge — the unit gap, the reduction or sample outcome, the unavailable
   * reflection it records with words written nowhere else — is no instant at all.
   */
  #ownInstants(runRecordIds: ReadonlyArray<string>): Map<string, string[]> {
    const result = new Map<string, string[]>();
    if (runRecordIds.length === 0) return result;
    const add = (runRecordId: string, at: string) => { const held = result.get(runRecordId); if (held === undefined) result.set(runRecordId, [at]); else held.push(at); };
    const states = this.#prepare(`SELECT s.run_record_id, s.recorded_at, json_extract(s.canonical_json, '$.reconciled') reconciled,
        json_extract(s.canonical_json, '$.requestAdmission.data.event.kind') event,
        CASE json_extract(s.canonical_json, '$.requestAdmission.data.event.evidence.kind')
          WHEN 'unit-checkpoint' THEN (SELECT c.recorded_at FROM analysis_unit_checkpoints c WHERE c.sha256 = json_extract(s.canonical_json, '$.requestAdmission.data.event.evidence.digest')
            AND coalesce(json_extract(c.canonical_json, '$.unit.closed.gap.reason'), '') != ?)
          WHEN 'clarification-checkpoint' THEN (SELECT q.raised_at FROM analysis_clarification_requests q WHERE q.sha256 = json_extract(s.canonical_json, '$.requestAdmission.data.event.evidence.digest'))
          WHEN 'reflection-outcome' THEN (SELECT o.recorded_at FROM analysis_task_outcomes o WHERE o.sha256 = json_extract(s.canonical_json, '$.requestAdmission.data.event.evidence.digest'))
          WHEN 'stage-checkpoint' THEN CASE WHEN json_extract(s.canonical_json, '$.stageContinuation.data.reduction.outcome.reason') = ?
            OR instr(coalesce(json_extract(s.canonical_json, '$.stageContinuation.data.sampling.gapReasons'), ''), ?) > 0 THEN NULL ELSE s.recorded_at END
          WHEN 'unavailable' THEN NULL ELSE s.recorded_at END evidenced
      FROM analysis_run_states s WHERE s.run_record_id IN (${ids(runRecordIds)})`)
      .all(RECOVERED_UNIT_REASON, RECOVERED_REDUCTION_REASON, RECOVERED_SAMPLING_MARK, ...runRecordIds) as SqlRow[];
    for (const row of states) {
      if (row.reconciled === 1) continue;
      if (row.event !== 'resolve') add(String(row.run_record_id), String(row.recorded_at));
      else if (row.evidenced !== null) add(String(row.run_record_id), String(row.evidenced));
    }
    const recorded = this.#prepare(`SELECT run_record_id, recorded_at FROM analysis_unit_checkpoints WHERE run_record_id IN (${ids(runRecordIds)})
        AND coalesce(json_extract(canonical_json, '$.unit.closed.gap.reason'), '') != ?
      UNION ALL SELECT a.run_record_id, s.recorded_at FROM analysis_harness_spans s JOIN analysis_execution_attempts a ON a.attempt_id = s.attempt_id
        WHERE a.run_record_id IN (${ids(runRecordIds)})`).all(...runRecordIds, RECOVERED_UNIT_REASON, ...runRecordIds) as SqlRow[];
    for (const row of recorded) add(String(row.run_record_id), String(row.recorded_at));
    return result;
  }

  /**
   * The working time of each set's Runs, with the requests and model once every latest Run ended; `null` for a set with no Run.
   * One read of the run states for all sets, and one of the outcomes of the sets that ended.
   */
  ofTaskIntentSets(sets: ReadonlyArray<IntentSet>): Array<TaskWorkProjection | null> {
    const readings = this.runs([...new Set(sets.flatMap((set) => set.taskIntentIds))]);
    const works = sets.map((set) => {
      const own = readings.filter((reading) => set.taskIntentIds.includes(reading.taskIntentId));
      if (own.length === 0) return null;
      const latest = new Map(own.map((reading) => [reading.taskIntentId, reading]));
      const work = unionWork(own.flatMap((reading) => reading.intervals));
      return { work, ended: work.workingSince === null && [...latest.values()].every((reading) => TERMINAL.has(reading.last)) };
    });
    const requests = this.#requests([...new Set(sets.flatMap((set, index) => works[index]?.ended === true ? set.taskIntentIds : []))]);
    return sets.map((set, index) => {
      const read = works[index];
      if (read == null) return null;
      const counted = set.taskIntentIds.filter((taskIntentId) => requests.has(taskIntentId));
      return { workedMs: read.work.workedMs, workingSince: iso(read.work.workingSince),
        finished: !read.ended ? null : { requests: counted.length === 0 ? null : counted.reduce((sum, taskIntentId) => sum + requests.get(taskIntentId)!, 0),
          modelLabel: set.modelLabel !== undefined ? set.modelLabel : set.reviewRunId !== undefined ? this.#owners.reviewModelLabel(set.reviewRunId) : this.#modelLabel(set.taskIntentIds) } };
    });
  }

  ofTaskIntents(taskIntentIds: ReadonlyArray<string>, modelLabel?: string | null): TaskWorkProjection | null {
    return this.ofTaskIntentSets([{ taskIntentIds, ...(modelLabel === undefined ? {} : { modelLabel }) }])[0]!;
  }

  ofReview(reviewRunId: string, modelLabel?: string | null): TaskWorkProjection | null {
    return this.ofTaskIntentSets([this.#reviewSet(reviewRunId, modelLabel)])[0]!;
  }

  #reviewSet(reviewRunId: string, modelLabel?: string | null): IntentSet {
    return { taskIntentIds: this.#owners.reviewTaskIntents(reviewRunId).map((entry) => entry.taskIntentId), reviewRunId, ...(modelLabel === undefined ? {} : { modelLabel }) };
  }

  /**
   * The rows of one Book's 任务 panel (Issue #1670): every Task's reading from one read of the run states and one of the dialogue
   * attempts, so the figure is the plan's and the cost does not grow by a read per row.
   */
  ofItems(items: ReadonlyArray<GlobalAttentionItemProjection>, live: (attemptId: string) => boolean): Array<TaskWorkProjection | null> {
    const sets = items.map((item): IntentSet | null => {
      const target = item.target;
      if (target.kind === 'analysis' || target.kind === 'analysis-plan') return { taskIntentIds: [target.taskIntentId], ...(item.modelLabel === undefined ? {} : { modelLabel: item.modelLabel }) };
      if (target.kind === 'review' || target.kind === 'review-plan') return this.#reviewSet(target.reviewRunId, item.modelLabel);
      if (target.kind === 'task-plan') return target.ref === null || target.taskKind === 'fixed-task' ? null : target.taskKind === 'review-run'
        ? this.#reviewSet(target.ref, item.modelLabel) : { taskIntentIds: [target.ref], ...(item.modelLabel === undefined ? {} : { modelLabel: item.modelLabel }) };
      return null;
    });
    const ledger = this.ofTaskIntentSets(sets.flatMap((set) => set === null ? [] : [set]));
    const dialogues = this.#dialogues(items.flatMap((item) => item.target.kind === 'dialogue' ? [item.target.dialogueId] : []), live);
    let next = 0;
    return items.map((item, index) => item.target.kind === 'dialogue' ? dialogues.get(item.target.dialogueId)?.(item.modelLabel ?? null) ?? null
      : sets[index] === null ? null : ledger[next++]!);
  }

  /**
   * A dialogue's attempts, each from the instant its execution was bound — a queued attempt that never ran works for no time —
   * to its settlement; the one under way is open. An attempt the next start settled as AI7 having closed under it
   * (`SERVICE_STOPPED`) ends at the last instant it recorded itself before then (its binding or its Harness span), never at the
   * settlement. Each attempt is one request: an attempt records no request count of its own.
   */
  #dialogues(dialogueIds: ReadonlyArray<string>, live: (attemptId: string) => boolean): Map<string, (modelLabel: string | null) => TaskWorkProjection> {
    const result = new Map<string, (modelLabel: string | null) => TaskWorkProjection>();
    if (dialogueIds.length === 0) return result;
    const rows = this.#prepare(`SELECT a.dialogue_id, a.attempt_id, b.bound_at, s.opened_at, o.settled_at, o.cause_code FROM dialogue_attempts a
      LEFT JOIN dialogue_execution_bindings b ON b.attempt_id = a.attempt_id LEFT JOIN dialogue_harness_spans s ON s.attempt_id = a.attempt_id
      LEFT JOIN dialogue_attempt_outcomes o ON o.attempt_id = a.attempt_id WHERE a.dialogue_id IN (${ids(dialogueIds)}) ORDER BY a.dialogue_id, a.ordinal`)
      .all(...dialogueIds) as SqlRow[];
    for (const dialogueId of new Set(rows.map((row) => String(row.dialogue_id)))) {
      const attempts = rows.filter((row) => row.dialogue_id === dialogueId);
      const intervals = attempts.flatMap((row): WorkInterval[] => {
        if (row.bound_at === null) return [];
        const from = Date.parse(String(row.bound_at));
        if (row.settled_at === null) return live(String(row.attempt_id)) ? [{ from, to: null }] : [];
        const to = row.cause_code === DIALOGUE_STOPPED_CAUSE ? (row.opened_at === null ? from : Date.parse(String(row.opened_at))) : Date.parse(String(row.settled_at));
        return [{ from, to: Math.max(from, to) }];
      });
      const work = unionWork(intervals);
      const ended = work.workingSince === null && attempts.at(-1)!.settled_at !== null;
      result.set(dialogueId, (modelLabel) => ({ workedMs: work.workedMs, workingSince: iso(work.workingSince),
        finished: ended ? { requests: attempts.length, modelLabel } : null }));
    }
    return result;
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
   * `estimateTaskStarts` applies, on 用时; `null` when none was measured. A sample is chosen by its completion, never its creation:
   * a Task Intent of the kind whose completed outcome was recorded in the window, or a Review Run one of whose category outcomes
   * completed in it, every category completed. Bounded reads: the kind's outcomes in the window, those samples' outcomes and Runs.
   */
  perPartMs(kind: string | null, now = Date.now()): number | null {
    if (kind === null) return null;
    const since = new Date(now - WEEK_MS).toISOString();
    const samples: Array<{ taskIntentIds: ReadonlyArray<string>; partsOf: ReadonlyArray<string> }> = kind === 'review-run'
      ? (this.#prepare(`SELECT DISTINCT rr.review_run_id FROM review_runs rr JOIN json_each(rr.canonical_json, '$.categories') c
          JOIN analysis_task_outcomes o ON o.task_intent_id = json_extract(c.value, '$.task.taskIntentId')
          WHERE o.recorded_at >= ? AND o.classification IN ('completed', 'completed-with-gaps')`).all(since) as SqlRow[]).map((row) => {
        const tasks = this.#owners.reviewTaskIntents(String(row.review_run_id));
        return { taskIntentIds: tasks.map((task) => task.taskIntentId), partsOf: tasks.filter((task) => !task.synthesis).map((task) => task.taskIntentId) };
      })
      : (this.#prepare(`SELECT o.task_intent_id FROM analysis_task_outcomes o JOIN analysis_task_intents t ON t.task_intent_id = o.task_intent_id
          WHERE t.kind = ? AND o.recorded_at >= ? AND o.classification IN ('completed', 'completed-with-gaps')`).all(kind, since) as SqlRow[])
        .map((row) => ({ taskIntentIds: [String(row.task_intent_id)], partsOf: [String(row.task_intent_id)] }));
    if (samples.length === 0) return null;
    const all = [...new Set(samples.flatMap((sample) => sample.taskIntentIds))];
    const completed = new Set((this.#prepare(`SELECT task_intent_id FROM analysis_task_outcomes WHERE task_intent_id IN (${ids(all)})
      AND classification IN ('completed', 'completed-with-gaps')`).all(...all) as SqlRow[]).map((row) => String(row.task_intent_id)));
    const readings = this.runs(all, true);
    const runsOf = (taskIntentIds: ReadonlyArray<string>) => readings.filter((reading) => taskIntentIds.includes(reading.taskIntentId));
    const rates = samples.flatMap((sample) => {
      if (sample.partsOf.length === 0 || sample.partsOf.some((taskIntentId) => !completed.has(taskIntentId))) return [];
      const worked = unionWork(runsOf(sample.taskIntentIds).flatMap((reading) => reading.intervals));
      const parts = runsOf(sample.partsOf).reduce((total, reading) => total + (reading.parts ?? 0), 0);
      return worked.workingSince === null && worked.workedMs > 0 && parts > 0 ? [worked.workedMs / parts] : [];
    });
    return rates.length === 0 ? null : rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
  }

  /** Each Task Intent's requests, Σ over its outcomes' Run Reports; an intent no Run Report counted is absent. */
  #requests(taskIntentIds: ReadonlyArray<string>): Map<string, number> {
    const result = new Map<string, number>();
    if (taskIntentIds.length === 0) return result;
    const rows = this.#prepare(`SELECT task_intent_id, json_extract(canonical_json, '$.report.usagePerStage') usage FROM analysis_task_outcomes
      WHERE task_intent_id IN (${ids(taskIntentIds)})`).all(...taskIntentIds) as SqlRow[];
    for (const row of rows) {
      if (typeof row.usage !== 'string') continue;
      const stages = JSON.parse(row.usage) as Record<string, { requests?: unknown }>;
      const taskIntentId = String(row.task_intent_id);
      result.set(taskIntentId, (result.get(taskIntentId) ?? 0) + Object.values(stages).reduce((sum, stage) => sum + (typeof stage?.requests === 'number' ? stage.requests : 0), 0));
    }
    return result;
  }

  #modelLabel(taskIntentIds: ReadonlyArray<string>): string | null {
    for (const taskIntentId of taskIntentIds) {
      const label = launchedTaskModelLabels(this.#db, taskIntentId).modelLabel;
      if (label !== undefined) return label;
    }
    return null;
  }
}
