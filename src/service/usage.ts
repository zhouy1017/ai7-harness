import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import { DialogueLedger } from './dialogue/dialogue-ledger.js';
import { readHarnessSessionLog } from './harness/session-log.js';
import {
  USAGE_EMPTY_LABEL,
  USAGE_ROW_RUN_LINKS,
  type UsageGrouping,
  type UsageProjection,
  type UsageRange,
  type UsageRouteTokensProjection,
  type UsageRowProjection,
  type UsageRunLinkProjection,
  type RunReportProjection,
} from '../shared/protocol.js';

type SqlRow = Record<string, SQLOutputValue>;

/**
 * 用量 (Issue #936, plan slice 11c; V2-UX-MSET-010). A read-only sum over the Task Outcomes the ledger already holds: the Run
 * Report's `usagePerStage` (the same figures the Run Budget Ceiling is measured against), the Run's Book and Task kind, and the
 * route its Execution Binding names. It adds no relation, writes nothing and never asks a Provider — a price is the editor's own
 * entry and is applied by the window, not here.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const RANGE_MS: Readonly<Record<Exclude<UsageRange, 'all'>, number>> = { day: DAY_MS, week: 7 * DAY_MS, month: 30 * DAY_MS };

const pad = (value: number, width = 2): string => String(value).padStart(width, '0');

/** The period a Run falls in, on the machine's own calendar: hours inside a day, days inside a week or month, months in all. */
function periodOf(instant: string, range: UsageRange): string | null {
  const at = new Date(instant);
  if (Number.isNaN(at.getTime())) return null;
  const day = `${pad(at.getFullYear(), 4)}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
  if (range === 'day') return `${day}T${pad(at.getHours())}`;
  if (range === 'all') return day.slice(0, 7);
  return day;
}

function tokenCount(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

/** Input and output tokens summed over every stage of one Run Report, as the Run Budget Ceiling sums them. */
function tokensOf(usagePerStage: unknown): { inputTokens: number; outputTokens: number } {
  let inputTokens = 0;
  let outputTokens = 0;
  if (typeof usagePerStage === 'object' && usagePerStage !== null) {
    for (const stage of Object.values(usagePerStage as Record<string, unknown>)) {
      if (typeof stage !== 'object' || stage === null) continue;
      inputTokens += tokenCount((stage as Record<string, unknown>)['inputTokens']);
      outputTokens += tokenCount((stage as Record<string, unknown>)['outputTokens']);
    }
  }
  return { inputTokens, outputTokens };
}

/** The stored usage object; a value that is not JSON reads as no usage rather than failing the page. */
function parseUsage(json: string): unknown {
  try {
    return JSON.parse(json) as unknown;
  } catch {
    return null;
  }
}

interface Accumulator {
  key: string;
  label: string;
  runCount: number;
  inputTokens: number;
  outputTokens: number;
  byRoute: Map<string | null, { runCount: number; inputTokens: number; outputTokens: number }>;
  runs: UsageRunLinkProjection[];
}

function accumulate(into: Accumulator['byRoute'], route: string | null, inputTokens: number, outputTokens: number, runCount = 1): void {
  const held = into.get(route) ?? { runCount: 0, inputTokens: 0, outputTokens: 0 };
  held.runCount += runCount;
  held.inputTokens += inputTokens;
  held.outputTokens += outputTokens;
  into.set(route, held);
}

function routesOf(byRoute: Accumulator['byRoute']): UsageRouteTokensProjection[] {
  return [...byRoute.entries()]
    .map(([route, held]) => ({ route, runCount: held.runCount, inputTokens: held.inputTokens, outputTokens: held.outputTokens }))
    .sort((left, right) => (left.route === null ? 1 : right.route === null ? -1 : left.route.localeCompare(right.route)));
}

export class UsageLedger {
  readonly #db: DatabaseSync;

  constructor(db: DatabaseSync, readonly globalDialogue?: { readonly sessionLogRoot: string; readonly operationalScope: () => string }) {
    this.#db = db;
  }

  inspect(range: UsageRange, groupBy: UsageGrouping, now: Date = new Date(), runOffset = 0, runRecordId?: string): UsageProjection {
    const since = range === 'all' ? null : new Date(now.getTime() - RANGE_MS[range]).toISOString();
    const outcomes = this.#db.prepare(
      `SELECT o.run_record_id, o.task_intent_id, o.recorded_at,
         json_type(o.canonical_json, '$.report') report_type,
         json_extract(o.canonical_json, '$.report.usagePerStage') usage,
         t.book_id, t.kind, bk.title,
         json_extract(bd.canonical_json, '$.route') route
       FROM analysis_task_outcomes o
       JOIN analysis_task_intents t ON t.task_intent_id = o.task_intent_id
       JOIN books bk ON bk.book_id = t.book_id
       LEFT JOIN analysis_execution_attempts a ON a.run_record_id = o.run_record_id
       LEFT JOIN analysis_execution_bindings bd ON bd.attempt_id = a.attempt_id
       WHERE (?1 IS NULL OR o.recorded_at >= ?1) AND o.recorded_at <= ?2
       ORDER BY o.recorded_at DESC, o.run_record_id DESC`,
    ).all(since, now.toISOString()) as SqlRow[];
    outcomes.push(...this.#globalDialogueOutcomes(since, now.toISOString()));
    outcomes.sort((left, right) => String(right.recorded_at).localeCompare(String(left.recorded_at)) || String(right.run_record_id).localeCompare(String(left.run_record_id)));

    const reviewRuns = this.#reviewRunsOfTasks(outcomes);
    const rows = new Map<string, Accumulator>();
    const totals = { runCount: 0, inputTokens: 0, outputTokens: 0, byRoute: new Map<string | null, { runCount: number; inputTokens: number; outputTokens: number }>() };
    let unrecordedRuns = 0;
    let detail: UsageRunLinkProjection | null = null;

    for (const outcome of outcomes) {
      // A Task Outcome recorded before the Run Report existed holds no usage: said apart, never counted as zero.
      if (outcome.report_type !== 'object') {
        if (outcome.global_dialogue !== 1) unrecordedRuns += 1;
        continue;
      }
      const recordedAt = String(outcome.recorded_at);
      const kind = String(outcome.kind);
      const bookId = outcome.global_dialogue === 1 ? 'global-agent' : String(outcome.book_id);
      const bookTitle = String(outcome.title);
      const key = groupBy === 'book' ? bookId : groupBy === 'taskKind' ? kind : periodOf(recordedAt, range);
      if (key === null) continue;
      const usage = tokensOf(typeof outcome.usage === 'string' ? parseUsage(outcome.usage) : null);
      const route = typeof outcome.route === 'string' ? outcome.route : null;
      let row = rows.get(key);
      if (row === undefined) {
        row = { key, label: groupBy === 'book' ? bookTitle : key, runCount: 0, inputTokens: 0, outputTokens: 0, byRoute: new Map(), runs: [] };
        rows.set(key, row);
      }
      // Dialogue tokens contribute to usage, but a Book-less attempt creates no AI7 Run, count or report link.
      const runCount = outcome.global_dialogue === 1 ? 0 : 1;
      row.runCount += runCount;
      row.inputTokens += usage.inputTokens;
      row.outputTokens += usage.outputTokens;
      accumulate(row.byRoute, route, usage.inputTokens, usage.outputTokens, runCount);
      // A Book-less turn has no Run report or Book link to manufacture.
      if (outcome.global_dialogue !== 1 && ((row.runCount > runOffset && row.runs.length < USAGE_ROW_RUN_LINKS) || outcome.run_record_id === runRecordId)) {
        const taskIntentId = String(outcome.task_intent_id);
        const link: UsageRunLinkProjection = {
          runRecordId: String(outcome.run_record_id), taskIntentId, bookId, bookTitle, taskKind: kind,
          reviewRunId: reviewRuns.get(taskIntentId) ?? null, route, recordedAt, ...usage,
          report: null,
        };
        if (row.runCount > runOffset && row.runs.length < USAGE_ROW_RUN_LINKS) row.runs.push(link);
        if (runRecordId !== undefined && outcome.run_record_id === runRecordId) {
          const stored = this.#db.prepare("SELECT json_extract(canonical_json, '$.report') report FROM analysis_task_outcomes WHERE run_record_id = ?").get(runRecordId) as SqlRow;
          const report = typeof stored.report === 'string' ? parseUsage(stored.report) as RunReportProjection | null : null;
          detail = { ...link, report: report !== null && report.runRecordId === runRecordId && report.taskIntentId === taskIntentId ? report : null };
        }
      }
      totals.runCount += runCount;
      totals.inputTokens += usage.inputTokens;
      totals.outputTokens += usage.outputTokens;
      accumulate(totals.byRoute, route, usage.inputTokens, usage.outputTokens, runCount);
    }

    const ordered = [...rows.values()].sort((left, right) => groupBy === 'time'
      ? right.key.localeCompare(left.key)
      : (right.inputTokens + right.outputTokens) - (left.inputTokens + left.outputTokens) || left.key.localeCompare(right.key));
    const projected: UsageRowProjection[] = ordered.map((row) => ({
      key: row.key, label: row.label, runCount: row.runCount, inputTokens: row.inputTokens, outputTokens: row.outputTokens,
      byRoute: routesOf(row.byRoute), runs: row.runs,
    }));
    return {
      range, groupBy, asOf: now.toISOString(), since, rows: projected,
      totals: { runCount: totals.runCount, inputTokens: totals.inputTokens, outputTokens: totals.outputTokens, byRoute: routesOf(totals.byRoute) },
      unrecordedRuns,
      emptyLabel: projected.length === 0 ? USAGE_EMPTY_LABEL : null,
      ...(runRecordId === undefined ? {} : { detail }),
    };
  }

  /**
   * Only the session's reported token events, through each exact binding/span. An attempt with none reported adds nothing:
   * never estimated, and not an unrecorded AI7 Run, since a Book-less attempt is no Run.
   */
  #globalDialogueOutcomes(since: string | null, until: string): SqlRow[] {
    if (this.globalDialogue === undefined) return [];
    const ledger = new DialogueLedger(this.#db);
    const outcomes: SqlRow[] = [];
    const tasks = [];
    for (let offset = 0;;) {
      const page = ledger.globalTasks(offset);
      if (page.length === 0) break;
      tasks.push(...page); offset += page.length;
    }
    for (const task of tasks) {
      if (task.operationalScope !== this.globalDialogue.operationalScope()) continue;
      for (const attempt of ledger.attempts(task.dialogueId)) {
        if (attempt.binding === null || attempt.span === null) continue;
        const at = attempt.createdAt;
        if (since !== null && at < since || at > until) continue;
        const steps = new Map<string, { inputTokens: number; outputTokens: number }>();
        try {
          const log = readHarnessSessionLog(this.globalDialogue.sessionLogRoot, attempt.span.harnessSessionId);
          for (const event of log?.events.slice(attempt.span.startSeq, (attempt.outcome?.endSeq ?? (log.events.length - 1)) + 1) ?? []) {
            if (event.type !== 'assistant/message' && event.type !== 'assistant/chunk') continue;
            const data = event.data as { turn: number; step: number; usage?: unknown; chunk?: { type: string; usage?: unknown } };
            const usage = event.type === 'assistant/message' ? data.usage : data.chunk?.type === 'usage' ? data.chunk.usage : undefined;
            if (usage === undefined || usage === null || typeof usage !== 'object') continue;
            const tokens = usage as Record<string, unknown>;
            // The assembled message repeats the chunk's step total. A per-step key counts it once, including cancellation.
            steps.set(`${data.turn}/${data.step}`, { inputTokens: tokenCount(tokens['inputTokens']), outputTokens: tokenCount(tokens['outputTokens']) });
          }
        } catch { /* A missing/damaged session is an unrecorded attempt, not zero usage. */ }
        outcomes.push({ global_dialogue: 1, run_record_id: attempt.attemptId, task_intent_id: task.dialogueId, recorded_at: at,
          report_type: steps.size === 0 ? null : 'object', usage: JSON.stringify(Object.fromEntries(steps)),
          book_id: null, title: '全域智能体（无图书）', kind: 'global-agent-dialogue', route: attempt.binding.route });
      }
    }
    return outcomes;
  }

  /** The Review Run each review-category Task belongs to, read only when a Task of that family is among the Runs. */
  #reviewRunsOfTasks(outcomes: ReadonlyArray<SqlRow>): Map<string, string> {
    const map = new Map<string, string>();
    if (!outcomes.some((outcome) => String(outcome.kind).startsWith('editorial-review/'))) return map;
    const rows = this.#db.prepare(
      `SELECT rr.review_run_id, json_extract(c.value, '$.task.taskIntentId') task_intent_id
       FROM review_runs rr JOIN json_each(rr.canonical_json, '$.categories') c`,
    ).all() as SqlRow[];
    for (const row of rows) {
      if (typeof row.task_intent_id === 'string') map.set(row.task_intent_id, String(row.review_run_id));
    }
    return map;
  }
}
