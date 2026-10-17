import { DatabaseSync } from 'node:sqlite';
import { beforeEach, describe, expect, it } from 'vitest';
import { UsageLedger } from '../../src/service/usage.js';
import { USAGE_EMPTY_LABEL, USAGE_ROW_RUN_LINKS } from '../../src/shared/protocol.js';

// Unit suite for the 用量 aggregate (Issue #936, plan slice 11c) over a minimal in-memory ledger: only the columns the read
// touches, so each edge — a Run settled before the Run Report existed, a Run never bound to a route, a damaged usage value, a
// review-category Task, more Runs than a row lists — is stated directly. The real-store suite (`tests/service/usage.test.ts`)
// proves the same read over Runs the product recorded.

let db: DatabaseSync;
let ledger: UsageLedger;

beforeEach(() => {
  db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE books (book_id TEXT PRIMARY KEY, title TEXT NOT NULL);
    CREATE TABLE analysis_task_intents (task_intent_id TEXT PRIMARY KEY, book_id TEXT NOT NULL, kind TEXT NOT NULL);
    CREATE TABLE analysis_task_outcomes (outcome_id TEXT PRIMARY KEY, task_intent_id TEXT NOT NULL, run_record_id TEXT NOT NULL, recorded_at TEXT NOT NULL, canonical_json TEXT NOT NULL);
    CREATE TABLE analysis_execution_attempts (attempt_id TEXT PRIMARY KEY, run_record_id TEXT NOT NULL);
    CREATE TABLE analysis_execution_bindings (attempt_id TEXT PRIMARY KEY, canonical_json TEXT NOT NULL);
    CREATE TABLE review_runs (review_run_id TEXT PRIMARY KEY, canonical_json TEXT NOT NULL);
  `);
  ledger = new UsageLedger(db);
});

let counter = 0;
const stage = (inputTokens: number, outputTokens: number) => ({ requests: 1, inputTokens, outputTokens });

interface RunSeed {
  book?: string;
  kind?: string;
  at?: string;
  route?: string | null;
  usage?: unknown;
  /** `false` writes an outcome with no report at all; `'null'` one whose report is explicitly null. */
  report?: boolean | 'null';
}

/** One settled Run: its Book, Task intent, outcome and (when bound) Execution Binding. */
function run(seed: RunSeed = {}): { runRecordId: string; taskIntentId: string } {
  counter += 1;
  const bookId = seed.book ?? 'book-a';
  db.prepare('INSERT OR IGNORE INTO books(book_id, title) VALUES (?, ?)').run(bookId, `书 ${bookId}`);
  const taskIntentId = `task-${counter}`;
  const runRecordId = `run-${counter}`;
  db.prepare('INSERT INTO analysis_task_intents(task_intent_id, book_id, kind) VALUES (?, ?, ?)').run(taskIntentId, bookId, seed.kind ?? 'baseline-manuscript-analysis');
  const usage = seed.usage ?? { units: stage(100, 20), 'cross-unit-reduction': stage(10, 2), 'assurance-sampling': stage(5, 1), 'run-report-reflection': stage(3, 1) };
  const report = seed.report === false ? {} : { report: seed.report === 'null' ? null : { usagePerStage: usage } };
  db.prepare('INSERT INTO analysis_task_outcomes(outcome_id, task_intent_id, run_record_id, recorded_at, canonical_json) VALUES (?, ?, ?, ?, ?)')
    .run(`outcome-${counter}`, taskIntentId, runRecordId, seed.at ?? '2026-10-10T12:00:00.000Z', JSON.stringify(report));
  if (seed.route !== null) {
    db.prepare('INSERT INTO analysis_execution_attempts(attempt_id, run_record_id) VALUES (?, ?)').run(`attempt-${counter}`, runRecordId);
    db.prepare('INSERT INTO analysis_execution_bindings(attempt_id, canonical_json) VALUES (?, ?)').run(`attempt-${counter}`, JSON.stringify({ route: seed.route ?? 'opencode-go' }));
  }
  return { runRecordId, taskIntentId };
}

const NOW = new Date('2026-10-17T12:00:00.000Z');
const TOTAL_PER_RUN = 100 + 20 + 10 + 2 + 5 + 1 + 3 + 1;

describe('UsageLedger', () => {
  it('has no rows and says 尚无用量 for an empty ledger', () => {
    const usage = ledger.inspect('all', 'book', NOW);
    expect(usage).toMatchObject({ rows: [], emptyLabel: USAGE_EMPTY_LABEL, unrecordedRuns: 0, since: null, totals: { runCount: 0, inputTokens: 0, outputTokens: 0, byRoute: [] } });
  });

  it('sums every stage of the Run Report, input and output apart', () => {
    run({ usage: { units: stage(100, 20), 'cross-unit-reduction': stage(10, 2), 'assurance-sampling': stage(5, 1), 'run-report-reflection': stage(3, 1), 'platform-tools': stage(7, 4) } });
    const usage = ledger.inspect('all', 'book', NOW);
    expect(usage.totals).toMatchObject({ runCount: 1, inputTokens: 125, outputTokens: 28 });
    expect(usage.rows[0]).toMatchObject({ runCount: 1, inputTokens: 125, outputTokens: 28 });
  });

  it('groups by Book, ordered by tokens, each row listing its exact Runs with their own figures', () => {
    const first = run({ book: 'book-a' });
    const second = run({ book: 'book-b', usage: { units: stage(1000, 100) }, at: '2026-10-11T12:00:00.000Z' });
    const third = run({ book: 'book-a', at: '2026-10-12T12:00:00.000Z' });
    const usage = ledger.inspect('all', 'book', NOW);
    expect(usage.rows.map((row) => [row.key, row.label, row.runCount])).toEqual([['book-b', '书 book-b', 1], ['book-a', '书 book-a', 2]]);
    const rowA = usage.rows.find((row) => row.key === 'book-a')!;
    expect(rowA.inputTokens + rowA.outputTokens).toBe(2 * TOTAL_PER_RUN);
    // Newest first, each a link to its exact Run.
    expect(rowA.runs.map((link) => link.runRecordId)).toEqual([third.runRecordId, first.runRecordId]);
    expect(rowA.runs[0]).toMatchObject({ taskIntentId: third.taskIntentId, bookId: 'book-a', bookTitle: '书 book-a', taskKind: 'baseline-manuscript-analysis', route: 'opencode-go', reviewRunId: null, inputTokens: 118, outputTokens: 24 });
    expect(usage.rows[0]!.runs[0]!.runRecordId).toBe(second.runRecordId);
  });

  it('groups by Task kind', () => {
    run({ kind: 'baseline-manuscript-analysis' });
    run({ kind: 'factual-review' });
    run({ kind: 'factual-review' });
    const usage = ledger.inspect('all', 'taskKind', NOW);
    expect(usage.rows.map((row) => [row.key, row.runCount]).sort()).toEqual([['baseline-manuscript-analysis', 1], ['factual-review', 2]]);
  });

  it('splits tokens by the route each Run was bound to, a Run never bound standing apart', () => {
    run({ route: 'opencode-go' });
    run({ route: 'deepseek-open-platform' });
    run({ route: null });
    const usage = ledger.inspect('all', 'book', NOW);
    expect(usage.totals.byRoute.map((entry) => [entry.route, entry.runCount])).toEqual([['deepseek-open-platform', 1], ['opencode-go', 1], [null, 1]]);
    expect(usage.rows[0]!.byRoute).toHaveLength(3);
  });

  it('names a Run settled without a Run Report, and counts it as no usage rather than zero', () => {
    run();
    run({ report: false });
    run({ report: 'null' });
    const usage = ledger.inspect('all', 'book', NOW);
    expect(usage.totals.runCount).toBe(1);
    expect(usage.unrecordedRuns).toBe(2);
    run({ report: false, at: '2026-01-01T00:00:00.000Z' });
    expect(ledger.inspect('week', 'book', NOW).unrecordedRuns).toBe(2);
    expect(ledger.inspect('all', 'book', NOW).unrecordedRuns).toBe(3);
  });

  it('reads a damaged or missing usage value as no tokens instead of failing the page', () => {
    run({ usage: 'not an object' });
    run({ usage: { units: { requests: 1, inputTokens: -5, outputTokens: 'many' }, other: null } });
    const usage = ledger.inspect('all', 'book', NOW);
    expect(usage.totals).toMatchObject({ runCount: 2, inputTokens: 0, outputTokens: 0 });
  });

  it('applies rolling ranges to the instant a Run settled', () => {
    run({ at: '2026-10-17T06:00:00.000Z' });
    run({ at: '2026-10-12T12:00:00.000Z' });
    run({ at: '2026-09-25T12:00:00.000Z' });
    run({ at: '2025-01-01T12:00:00.000Z' });
    expect(ledger.inspect('day', 'book', NOW).totals.runCount).toBe(1);
    expect(ledger.inspect('week', 'book', NOW).totals.runCount).toBe(2);
    expect(ledger.inspect('month', 'book', NOW).totals.runCount).toBe(3);
    expect(ledger.inspect('all', 'book', NOW).totals.runCount).toBe(4);
    expect(ledger.inspect('week', 'book', NOW).since).toBe('2026-10-10T12:00:00.000Z');
    expect(ledger.inspect('day', 'book', new Date('2026-10-20T00:00:00.000Z')).emptyLabel).toBe(USAGE_EMPTY_LABEL);
  });

  it('buckets time by hour inside a day, by day inside a week or month, and by month over all', () => {
    run({ at: '2026-10-17T10:30:00.000Z' });
    run({ at: '2026-10-17T10:40:00.000Z' });
    run({ at: '2026-10-16T12:00:00.000Z' });
    const hours = ledger.inspect('day', 'time', NOW).rows;
    expect(hours.every((row) => /^\d{4}-\d{2}-\d{2}T\d{2}$/u.test(row.key))).toBe(true);
    const days = ledger.inspect('week', 'time', NOW).rows;
    expect(days.every((row) => /^\d{4}-\d{2}-\d{2}$/u.test(row.key))).toBe(true);
    expect(days.reduce((count, row) => count + row.runCount, 0)).toBe(3);
    // Newest period first.
    expect(days.map((row) => row.key)).toEqual([...days.map((row) => row.key)].sort().reverse());
    const months = ledger.inspect('all', 'time', NOW).rows;
    expect(months.map((row) => row.key)).toEqual(['2026-10']);
    expect(months[0]!.runCount).toBe(3);
  });

  it('links a review-category Task to its Review Run, and every other kind to none', () => {
    const review = run({ kind: 'editorial-review/language' });
    run({ kind: 'baseline-manuscript-analysis' });
    db.prepare('INSERT INTO review_runs(review_run_id, canonical_json) VALUES (?, ?)').run('review-run-1', JSON.stringify({ categories: [{ task: { taskIntentId: review.taskIntentId } }] }));
    const links = ledger.inspect('all', 'book', NOW).rows[0]!.runs;
    expect(links.find((link) => link.taskKind === 'editorial-review/language')?.reviewRunId).toBe('review-run-1');
    expect(links.find((link) => link.taskKind === 'baseline-manuscript-analysis')?.reviewRunId).toBeNull();
  });

  it('lists at most the newest Runs of a row while counting them all', () => {
    for (let index = 0; index < USAGE_ROW_RUN_LINKS + 5; index += 1) {
      run({ at: `2026-10-${String(1 + Math.floor(index / 24)).padStart(2, '0')}T${String(index % 24).padStart(2, '0')}:00:00.000Z` });
    }
    const row = ledger.inspect('all', 'book', NOW).rows[0]!;
    expect(row.runCount).toBe(USAGE_ROW_RUN_LINKS + 5);
    expect(row.runs).toHaveLength(USAGE_ROW_RUN_LINKS);
    expect(row.runs[0]!.recordedAt >= row.runs.at(-1)!.recordedAt).toBe(true);
  });

  it('writes nothing', () => {
    run();
    const before = db.prepare('SELECT count(*) count FROM analysis_task_outcomes').get() as { count: number };
    ledger.inspect('all', 'taskKind', NOW);
    expect((db.prepare('SELECT count(*) count FROM analysis_task_outcomes').get() as { count: number }).count).toBe(before.count);
  });
});
