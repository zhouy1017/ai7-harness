import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorialStore } from '../../src/service/store.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import { loadModelFixture, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import {
  BASELINE_ANALYSIS_KIND,
  BASELINE_ANALYSIS_TASK_GOAL,
  FACTUAL_REVIEW_KIND,
  FACTUAL_REVIEW_TASK_GOAL,
  USAGE_EMPTY_LABEL,
  type BaselineAnalysisProjection,
  type FactualReviewProjection,
  type LaunchPolicyProjection,
  type UsageProjection,
} from '../../src/shared/protocol.js';
import { estimateUsageCost, usageCsv } from '../../src/shared/usage.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import {
  importSample1Book,
  pinEditorialWorkspaceProfileRevision2,
  recordMissingCredentialConnection,
  requireExactSample1,
} from '../support/sample1-baseline.js';

// Service-integration suite (L2) for 用量 (Issue #936, plan slice 11c; V2-UX-MSET-010): the real store on a temporary Agent Data
// Root, exact `sample1` imported twice, a baseline Run on each Book and a factual-review Run on the first, all through the
// deterministic route. `inspectUsage` is a read over the Task Outcomes those Runs recorded; no Provider, socket or credential
// value is involved, and a price is only ever what a test types.

const FIXTURES_ROOT = resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url)));
const DAY_MS = 24 * 60 * 60 * 1000;

let roots: ServiceTestRoots;
let launchPolicy: LaunchPolicyProjection;
let baselineFixture: ResolvedModelFixture;
let factualFixture: ResolvedModelFixture;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-usage-');
  launchPolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
  expect(launchPolicy.integrityState).toBe('verified');
  baselineFixture = await loadModelFixture(FIXTURES_ROOT, 'sample1-baseline-one-unit-failure');
  factualFixture = await loadModelFixture(FIXTURES_ROOT, 'sample1-factual-authored');
});

afterEach(async () => {
  await roots.dispose();
});

function openWithRoute(route: ResolvedModelFixture): Promise<EditorialStore> {
  return EditorialStore.open(roots.dataRoot, roots.codeRoot, {
    induceUnprovableReconciliation: false,
    persistLegacyReviewedDraft: false,
    induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false,
    interruptAfterAbandonObjectRemoval: false,
    baselineAnalysisRoute: { fixtureIdentity: route.identity, fixtureSha256: route.sha256, fixtureLineage: route.lineage },
  });
}

const fakeSecrets = { resolve: async () => null };

interface SeededRun { bookId: string; title: string; runRecordId: string; taskKind: string; tokens: number; recordedAt: string }

/** Tokens a settled report holds, summed over every stage as the Run Budget Ceiling sums them. */
function reportTokens(projection: BaselineAnalysisProjection | FactualReviewProjection): number {
  return Object.values(projection.taskOutcome!.report!.usagePerStage).reduce((total, usage) => total + usage.inputTokens + usage.outputTokens, 0);
}

async function seed(): Promise<SeededRun[]> {
  const runs: SeededRun[] = [];
  const store = await openWithRoute(baselineFixture);
  const owner = new BaselineAnalysisExecutionOwner({ ledger: store.baselineAnalysisLedger, launchPolicy, fixture: baselineFixture, secretResolver: fakeSecrets });
  try {
    recordMissingCredentialConnection(store, 'L2 主编辑连接');
    for (const title of ['用量甲', '用量乙']) {
      const imported = await importSample1Book(store, roots.codeRoot, title);
      await pinEditorialWorkspaceProfileRevision2(store, imported.bookId);
      let progress = store.createBaselineAnalysisPreparationWork(imported.bookId, BASELINE_ANALYSIS_TASK_GOAL, null, launchPolicy);
      while (!progress.done) progress = store.advanceBaselineAnalysisPreparationWork(progress.workId!);
      const prepared = progress.projection!;
      const runRecordId = store.authorizeBaselineAnalysis(imported.bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest).dispatchRunRecordId!;
      owner.admitAndDispatch(runRecordId);
      await owner.whenIdle();
      const settled = store.inspectBaselineAnalysis(imported.bookId);
      expect(settled.taskOutcome?.report).not.toBeNull();
      runs.push({ bookId: imported.bookId, title, runRecordId, taskKind: BASELINE_ANALYSIS_KIND, tokens: reportTokens(settled), recordedAt: settled.taskOutcome!.recordedAt });
    }
    store.markCleanShutdown();
  } finally {
    await owner.dispose();
    store.close();
  }

  const factualStore = await openWithRoute(factualFixture);
  const factualOwner = new BaselineAnalysisExecutionOwner({ ledger: factualStore.factualReviewLedger, launchPolicy, fixture: factualFixture, secretResolver: fakeSecrets });
  try {
    const first = runs[0]!;
    let progress = factualStore.createFactualReviewPreparationWork(first.bookId, FACTUAL_REVIEW_TASK_GOAL, launchPolicy);
    while (!progress.done) progress = factualStore.advanceFactualReviewPreparationWork(progress.workId!);
    const prepared = progress.projection!;
    const runRecordId = factualStore.authorizeFactualReview(first.bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest).dispatchRunRecordId!;
    factualOwner.admitAndDispatch(runRecordId);
    await factualOwner.whenIdle();
    const settled = factualStore.inspectFactualReview(first.bookId);
    runs.push({ bookId: first.bookId, title: first.title, runRecordId, taskKind: FACTUAL_REVIEW_KIND, tokens: reportTokens(settled), recordedAt: settled.taskOutcome!.recordedAt });
    factualStore.markCleanShutdown();
  } finally {
    await factualOwner.dispose();
    factualStore.close();
  }
  return runs;
}

const tokensOf = (row: { inputTokens: number; outputTokens: number }): number => row.inputTokens + row.outputTokens;

describe('用量 over the real store', () => {
  it('says 尚无用量 before any Run has been recorded', async () => {
    const store = await openWithRoute(baselineFixture);
    try {
      for (const range of ['day', 'week', 'month', 'all'] as const) {
        for (const groupBy of ['book', 'taskKind', 'time'] as const) {
          const usage = store.inspectUsage({ range, groupBy });
          expect(usage.rows).toEqual([]);
          expect(usage.emptyLabel).toBe(USAGE_EMPTY_LABEL);
          expect(usage.totals).toMatchObject({ runCount: 0, inputTokens: 0, outputTokens: 0, byRoute: [] });
          expect(usage.unrecordedRuns).toBe(0);
        }
      }
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  });

  it('sums the recorded Runs by Book, Task kind and period, each row linking its exact Runs', async () => {
    await requireExactSample1(roots.codeRoot);
    const runs = await seed();
    const [baselineA, baselineB, factualA] = runs as [SeededRun, SeededRun, SeededRun];
    expect(baselineA.tokens).toBeGreaterThan(0);
    expect(factualA.tokens).toBeGreaterThan(0);

    const store = await openWithRoute(baselineFixture);
    try {
      const database = new DatabaseSync(resolve(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
      const outcomesBefore = (database.prepare('SELECT count(*) count FROM analysis_task_outcomes').get() as { count: number }).count;
      database.close();
      expect(outcomesBefore).toBe(3);

      const byBook = store.inspectUsage({ range: 'all', groupBy: 'book' });
      expect(byBook.emptyLabel).toBeNull();
      expect(byBook.totals.runCount).toBe(3);
      expect(tokensOf(byBook.totals)).toBe(baselineA.tokens + baselineB.tokens + factualA.tokens);
      const rowA = byBook.rows.find((row) => row.key === baselineA.bookId)!;
      const rowB = byBook.rows.find((row) => row.key === baselineB.bookId)!;
      expect(byBook.rows).toHaveLength(2);
      expect(rowA).toMatchObject({ label: '用量甲', runCount: 2 });
      expect(tokensOf(rowA)).toBe(baselineA.tokens + factualA.tokens);
      expect(rowB).toMatchObject({ label: '用量乙', runCount: 1 });
      expect(tokensOf(rowB)).toBe(baselineB.tokens);
      // Exact Run links: the Run record ids the Runs were authorized under, newest first, each with its own tokens and route.
      expect(rowA.runs.map((run) => run.runRecordId).sort()).toEqual([baselineA.runRecordId, factualA.runRecordId].sort());
      expect(rowA.runs.find((run) => run.runRecordId === factualA.runRecordId)).toMatchObject({
        bookId: baselineA.bookId, bookTitle: '用量甲', taskKind: FACTUAL_REVIEW_KIND, route: 'ai7-local-deterministic', reviewRunId: null,
      });
      expect(rowA.runs.map((run) => run.inputTokens + run.outputTokens).reduce((total, tokens) => total + tokens, 0)).toBe(tokensOf(rowA));
      expect(rowA.byRoute).toEqual([{ route: 'ai7-local-deterministic', runCount: 2, inputTokens: rowA.inputTokens, outputTokens: rowA.outputTokens }]);
      // Rows are in descending token order.
      expect(tokensOf(byBook.rows[0]!)).toBeGreaterThanOrEqual(tokensOf(byBook.rows[1]!));

      const byKind = store.inspectUsage({ range: 'all', groupBy: 'taskKind' });
      expect(byKind.rows.map((row) => [row.key, row.runCount]).sort()).toEqual([[BASELINE_ANALYSIS_KIND, 2], [FACTUAL_REVIEW_KIND, 1]].sort());
      expect(tokensOf(byKind.rows.find((row) => row.key === FACTUAL_REVIEW_KIND)!)).toBe(factualA.tokens);

      const now = new Date(Date.parse(factualA.recordedAt) + 60_000);
      const byTime = store.inspectUsage({ range: 'all', groupBy: 'time' }, now);
      expect(byTime.rows).toHaveLength(1);
      expect(byTime.rows[0]).toMatchObject({ runCount: 3 });
      expect(byTime.rows[0]!.key).toMatch(/^\d{4}-\d{2}$/u);
      const byDay = store.inspectUsage({ range: 'week', groupBy: 'time' }, now);
      expect(byDay.rows[0]!.key).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
      const byHour = store.inspectUsage({ range: 'day', groupBy: 'time' }, now);
      expect(byHour.rows[0]!.key).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}$/u);

      // Ranges are rolling windows over the instant a Run settled.
      const settledAt = Date.parse(factualA.recordedAt);
      expect(store.inspectUsage({ range: 'day', groupBy: 'book' }, new Date(settledAt + 2 * DAY_MS)).emptyLabel).toBe(USAGE_EMPTY_LABEL);
      expect(store.inspectUsage({ range: 'week', groupBy: 'book' }, new Date(settledAt + 2 * DAY_MS)).totals.runCount).toBe(3);
      expect(store.inspectUsage({ range: 'week', groupBy: 'book' }, new Date(settledAt + 10 * DAY_MS)).emptyLabel).toBe(USAGE_EMPTY_LABEL);
      expect(store.inspectUsage({ range: 'month', groupBy: 'book' }, new Date(settledAt + 10 * DAY_MS)).totals.runCount).toBe(3);
      expect(store.inspectUsage({ range: 'month', groupBy: 'book' }, new Date(settledAt + 40 * DAY_MS)).emptyLabel).toBe(USAGE_EMPTY_LABEL);
      expect(store.inspectUsage({ range: 'all', groupBy: 'book' }, new Date(settledAt + 4000 * DAY_MS)).totals.runCount).toBe(3);

      // A read: it recorded nothing.
      const after = new DatabaseSync(resolve(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
      expect((after.prepare('SELECT count(*) count FROM analysis_task_outcomes').get() as { count: number }).count).toBe(outcomesBefore);
      after.close();
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  });

  it('prices a row only from the editor\'s entered unit prices, and leaves the CSV with numbers and ids', async () => {
    await requireExactSample1(roots.codeRoot);
    await seed();
    const store = await openWithRoute(baselineFixture);
    try {
      const usage: UsageProjection = store.inspectUsage({ range: 'all', groupBy: 'book' });
      const row = usage.rows[0]!;
      // No entered price: no estimate at all, and no cost cell.
      expect(estimateUsageCost(row.byRoute, {})).toEqual({ state: 'unpriced', missingRoutes: ['ai7-local-deterministic'] });
      const price = { inputPerMillion: 2, outputPerMillion: 8, currency: 'CNY', enteredAt: '2026-10-17' };
      const estimate = estimateUsageCost(row.byRoute, { 'ai7-local-deterministic': price });
      expect(estimate.state).toBe('estimated');
      if (estimate.state === 'estimated') {
        expect(estimate.enteredOn).toEqual(['2026-10-17']);
        expect(estimate.amounts[0]!.currency).toBe('CNY');
        expect(estimate.amounts[0]!.amount).toBeCloseTo((row.inputTokens / 1e6) * 2 + (row.outputTokens / 1e6) * 8, 9);
      }

      const withPrices = usageCsv(usage, { 'ai7-local-deterministic': price });
      const withoutPrices = usageCsv(usage, {});
      for (const csv of [withPrices, withoutPrices]) {
        const lines = csv.trimEnd().split('\r\n');
        expect(lines[0]).toBe('group,group_id,route_id,run_count,input_tokens,output_tokens,estimated_cost,currency,price_entered_on');
        expect(lines).toHaveLength(1 + usage.rows.reduce((count, entry) => count + entry.byRoute.length, 0));
        for (const line of lines.slice(1)) {
          const cells = line.split(',');
          expect(cells).toHaveLength(9);
          // No text column: the group is a fixed word, the id an identifier, the rest counts, a number, a currency code or a day.
          expect(cells[0]).toBe('book');
          expect(cells[1]).toMatch(/^[0-9a-f-]{36}$/u);
          expect(cells[2]).toBe('ai7-local-deterministic');
          expect(cells.slice(3, 6).every((cell) => /^\d+$/u.test(cell))).toBe(true);
        }
        // A title is never written.
        expect(csv).not.toContain('用量');
      }
      expect(withoutPrices.trimEnd().split('\r\n')[1]!.endsWith(',,,')).toBe(true);
      expect(withPrices.trimEnd().split('\r\n')[1]!.split(',').slice(6)).toEqual([expect.stringMatching(/^\d+(\.\d+)?$/u), 'CNY', '2026-10-17']);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  });
});
