import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { BaselineAnalysisExecutionOwner, type UnitHold } from '../../src/service/analysis/execution.js';
import { loadModelFixture } from '../../src/service/provider/model-fixture.js';
import { ReviewRunDriver } from '../../src/service/review/review-run-driver.js';
import { SERIES_RETRIEVAL_EXCLUSION_TRIGGER_SQL, SERIES_SCOPE_STOP_SUMMARY, SeriesExclusionLedger, seriesExclusionImpact, seriesExclusionTarget } from '../../src/service/series-exclusions.js';
import {
  HISTORICALLY_AFFECTED_RESULT_MARKER,
  HISTORICAL_MARKER_UNVERIFIABLE,
  SERIES_RETRIEVAL_SCOPE_CHANGED_LABEL,
  type LaunchPolicyProjection,
  type ReviewRunProjection,
  type SeriesExclusionAction,
  type SeriesExclusionTargetInput,
} from '../../src/shared/protocol.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { SAMPLE1_UNITS, importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection, requireExactSample1 } from '../support/sample1-baseline.js';
import { J13_PLACE, J13_SERIES_TITLE, makeJ13Series } from '../support/series-consistency.js';

// Service-integration suite (L2) for the Series Retrieval Exclusion's reach into Review Runs (Issue #64, plan slice S29b;
// V2-UX-SER-022 to SER-027): a prepared Run's approval refused, an approved Run stopped as the exclusion is recorded, one
// reading now stopped by the current-read guard before its next range, the only two ways on, an ended exclusion restoring
// nothing, and the marker on a result that used the material — through the real store, the drive loop, the one execution
// owner and the local deterministic adapter over the authored fixture `sample1-series-consistency-authored`, exactly as
// J-13 holds it. The manuscript is exact `sample1` (ADR 0043); no Provider, socket or credential value is involved.

const FIXTURES_ROOT = resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url)));
const FIXTURE = 'sample1-series-consistency-authored';
const WHOLE = { kind: 'whole', fromChapterBlockId: null, toChapterBlockId: null } as const;
const ITEM_LABEL = `书系知识条目「${J13_PLACE}」（地点）`;

let roots: ServiceTestRoots;
let launchPolicy: LaunchPolicyProjection;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-series-exclusion-runs-');
  launchPolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
});

afterEach(async () => {
  await roots.dispose();
});

interface Session { store: EditorialStore; owner: BaselineAnalysisExecutionOwner; driver: ReviewRunDriver; seriesId: string }

/** A unit hold a test opens: units after the first wait until it is released. */
function gate(): { hold: UnitHold; release(): void; reached: Promise<void> } {
  let release!: () => void;
  let reached!: () => void;
  const released = new Promise<void>((resolve) => { release = resolve; });
  const atHold = new Promise<void>((resolve) => { reached = resolve; });
  return {
    hold: async (unitsSettled, interrupted) => {
      if (unitsSettled !== 0 || interrupted()) return;
      reached();
      await released;
    },
    release,
    reached: atHold,
  };
}

async function withSession(body: (session: Session, bookId: string) => Promise<void>, unitHold: UnitHold | null = null): Promise<void> {
  await requireExactSample1(roots.codeRoot);
  const fixture = await loadModelFixture(FIXTURES_ROOT, FIXTURE);
  const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot, {
    induceUnprovableReconciliation: false,
    persistLegacyReviewedDraft: false,
    induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false,
    interruptAfterAbandonObjectRemoval: false,
    baselineAnalysisRoute: { fixtureIdentity: fixture.identity, fixtureSha256: fixture.sha256, fixtureLineage: fixture.lineage },
  });
  const owner = new BaselineAnalysisExecutionOwner({
    ledger: store.baselineAnalysisLedger, launchPolicy, fixture, secretResolver: { resolve: async () => null }, unitHold,
    readGuard: (runRecordId) => store.seriesReadGuard(runRecordId),
  });
  const driver = new ReviewRunDriver(store.reviewRunDriveSteps, owner);
  try {
    const bookId = (await importSample1Book(store, roots.codeRoot, '星河之三')).bookId;
    await pinEditorialWorkspaceProfileRevision2(store, bookId);
    recordMissingCredentialConnection(store, 'S29 主编辑连接');
    const seriesId = makeJ13Series(store, bookId);
    await body({ store, owner, driver, seriesId }, bookId);
  } finally {
    const stopped = driver.dispose();
    await owner.dispose();
    await stopped;
    store.markCleanShutdown();
    store.close();
  }
}

function prepare(store: EditorialStore, bookId: string): ReviewRunProjection {
  let progress = store.createReviewRunPreparationWork(bookId, ['series-consistency'], WHOLE, launchPolicy);
  while (!progress.done) progress = store.advanceReviewRunPreparationWork(progress.workId!);
  return progress.projection!.run!;
}

function approve(store: EditorialStore, bookId: string, run: ReviewRunProjection): void {
  store.authorizeReviewRun(bookId, run.reviewRunId, [{ categoryId: 'series-consistency', planEnvelopeDigest: run.categories[0]!.planEnvelopeDigest! }]);
}

function refusal(operation: () => unknown): string {
  try {
    operation();
  } catch (error) {
    if (error instanceof StoreError) return `${error.code}:${error.message}`;
    throw error;
  }
  return 'no-error';
}

function itemOf(store: EditorialStore, seriesId: string): string {
  return store.inspectSeries(seriesId).knowledge.items[0]!.itemId;
}

/** One revision of an exclusion, recorded against its own preview, with the preview it showed. */
function exclude(store: EditorialStore, seriesId: string, action: SeriesExclusionAction, input: { target?: SeriesExclusionTargetInput; exclusionId?: string; reason?: string }) {
  const request = { seriesId, action, exclusionId: input.exclusionId ?? null, target: input.target ?? null, reason: input.reason ?? '' };
  const preview = store.previewSeriesExclusion(request);
  return { preview, result: store.recordSeriesExclusion({ ...request, previewDigest: preview.previewDigest }) };
}

function run(store: EditorialStore, bookId: string, reviewRunId: string): ReviewRunProjection {
  return store.inspectReviewWorkspace(bookId, reviewRunId).run!;
}

function outcomeSummary(runRecordId: string): string {
  const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
  try {
    const row = db.prepare('SELECT canonical_json FROM analysis_task_outcomes WHERE run_record_id = ?').get(runRecordId) as { canonical_json: string };
    return (JSON.parse(row.canonical_json) as { summary: string }).summary;
  } finally {
    db.close();
  }
}

describe('a Series Retrieval Exclusion over Review Runs', () => {
  it('refuses a prepared plan, stops an approved Run before its turn, and leaves only 修改计划并重新授权 and 取消任务', async () => {
    await withSession(async ({ store, driver, seriesId }, bookId) => {
      const itemId = itemOf(store, seriesId);
      const prepared = prepare(store, bookId);
      const approved = prepare(store, bookId);
      approve(store, bookId, approved);
      // The preview names the approved Run by its route and the prepared one by count, before anything is recorded.
      const preview = store.previewSeriesExclusion({ seriesId, action: 'add', exclusionId: null, target: { kind: 'knowledge-item', id: itemId }, reason: '待核对' });
      expect(preview.groups.map((group) => group.key)).toEqual(['future-reads', 'runs', 'history', 'unaffected']);
      expect(preview.groups[1]!.changes[0]).toBe(`1 个已授权或正在运行的任务会在下一次读取前停下，显示「${SERIES_RETRIEVAL_SCOPE_CHANGED_LABEL}」：《星河之三》第 2 次审阅。`);
      expect(preview.groups[2]!.changes).toEqual([]);
      expect(run(store, bookId, approved.reviewRunId).state).toBe('partial');

      const { result } = exclude(store, seriesId, 'add', { target: { kind: 'knowledge-item', id: itemId }, reason: '待核对' });
      expect([result.completionLabel, result.stoppedRuns]).toEqual(['书系检索排除已生效', 1]);
      // Stopped at once, in its own words: never 部分完成 · 可继续审阅, so never 继续审阅.
      const stopped = run(store, bookId, approved.reviewRunId);
      expect([stopped.state, stopped.stateLabel, stopped.canContinue]).toEqual(['scope-changed', SERIES_RETRIEVAL_SCOPE_CHANGED_LABEL, false]);
      expect([stopped.categories[0]!.state, stopped.categories[0]!.stateLabel]).toEqual(['refused', SERIES_RETRIEVAL_SCOPE_CHANGED_LABEL]);
      expect(stopped.categories[0]!.detail).toContain(`${ITEM_LABEL}在这次审阅准备之后被排除在书系检索之外`);
      // It is never driven again: the drive loop refuses a stopped Run.
      expect(() => driver.continue(approved.reviewRunId)).toThrowError(/只能修改计划并重新授权，或取消任务/u);
      expect(run(store, bookId, approved.reviewRunId).state).toBe('scope-changed');
      expect(store.inspectTaskPlan({ bookId, kind: 'review-run', ref: approved.reviewRunId }).state).toEqual({ key: 'stopped', label: SERIES_RETRIEVAL_SCOPE_CHANGED_LABEL });

      // An exclusion that stopped nothing new answers so, and the earlier, superseded preparation is no one's to approve.
      expect(refusal(() => approve(store, bookId, prepared))).toBe('REVIEW_RUN_SUPERSEDED:这次审阅的计划已被之后准备的一次取代；请授权最新的一次。');
      // With its one item excluded the Book has nothing left to check against, and says why.
      const category = store.inspectReviewWorkspace(bookId, null).categories.find((entry) => entry.categoryId === 'series-consistency')!;
      expect(category.unavailableReason).toBe(`书系「${J13_SERIES_TITLE}」可用于一致性审阅的书系知识都已排除在书系检索之外；停止排除或纳入其他书系知识后才能选。`);

      // 停止此排除 restores later reads only: the stopped Run stays stopped, its authorization is never restored.
      const exclusionId = store.inspectSeries(seriesId).exclusions.effective[0]!.exclusionId;
      exclude(store, seriesId, 'end', { exclusionId });
      expect(run(store, bookId, approved.reviewRunId).state).toBe('scope-changed');
      expect(store.inspectReviewWorkspace(bookId, null).categories.find((entry) => entry.categoryId === 'series-consistency')!.available).toBe(true);

      // 取消任务: the Run reads 已取消 and offers nothing more; a Run the exclusion never stopped is not cancelled here.
      const cancelled = store.cancelReviewRun(bookId, approved.reviewRunId).run!;
      expect([cancelled.state, cancelled.stateLabel, cancelled.canContinue, cancelled.categories[0]!.stateLabel]).toEqual(['cancelled', '已取消', false, '已取消']);
      expect(store.cancelReviewRun(bookId, approved.reviewRunId).run!.state).toBe('cancelled');
      const fresh = prepare(store, bookId);
      expect(refusal(() => store.cancelReviewRun(bookId, fresh.reviewRunId)))
        .toBe(`REVIEW_RUN_NOT_CANCELLABLE:只有显示「${SERIES_RETRIEVAL_SCOPE_CHANGED_LABEL}」的审阅可以在这里取消任务。`);
    });
  }, 300_000);

  it('guards the read itself: an exclusion in force that stopped nothing as it was recorded still stops a Run at its turn', async () => {
    await withSession(async ({ store, driver, seriesId }, bookId) => {
      const itemId = itemOf(store, seriesId);
      const approved = prepare(store, bookId);
      approve(store, bookId, approved);
      // Written to the ledger directly, as no command of the product would: nothing stopped the Run when it was recorded.
      const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
      try {
        const target = seriesExclusionTarget('knowledge-item', itemId, { subject: J13_PLACE, knowledgeClass: 'places' });
        new SeriesExclusionLedger(db).record({
          seriesId, action: 'add', prior: null, target, reason: '', previewDigest: 'a'.repeat(64),
          impact: seriesExclusionImpact('add', { seriesTitle: J13_SERIES_TITLE, target, reason: '', priorReason: null, itemsNamed: [], itemCount: 1,
            runsNamed: [], runCount: 0, preparedCount: 0, completedNamed: [], completedCount: 0 }),
        });
      } finally {
        db.close();
      }
      expect(run(store, bookId, approved.reviewRunId).state).toBe('partial');
      await driver.drive(approved.reviewRunId);
      const stopped = run(store, bookId, approved.reviewRunId);
      expect([stopped.state, stopped.categories[0]!.state, stopped.categories[0]!.stateLabel, stopped.findings.length])
        .toEqual(['scope-changed', 'refused', SERIES_RETRIEVAL_SCOPE_CHANGED_LABEL, 0]);
      expect(stopped.categories[0]!.detail).toContain(`${ITEM_LABEL}在这次审阅准备之后被排除在书系检索之外，它在读取前停下，没有发送任何内容。`);
    });
  }, 300_000);

  it('never lets a plan prepared before an exclusion be approved after the exclusion ends (Issue #64 review)', async () => {
    await withSession(async ({ store, seriesId }, bookId) => {
      const itemId = itemOf(store, seriesId);
      const prepared = prepare(store, bookId);
      const { result } = exclude(store, seriesId, 'add', { target: { kind: 'knowledge-item', id: itemId } });
      exclude(store, seriesId, 'end', { exclusionId: result.exclusionId });
      // Nothing is in force, yet the plan was made before an exclusion that reached what it pinned: it is prepared again.
      expect(store.inspectSeries(seriesId).exclusions.effective).toEqual([]);
      const reason = `「书系一致性」：${SERIES_RETRIEVAL_SCOPE_CHANGED_LABEL}——它所依据的${ITEM_LABEL}在这次审阅准备之后被排除在书系检索之外；请重新准备这次审阅。`;
      expect(refusal(() => approve(store, bookId, prepared))).toBe(`SERIES_RETRIEVAL_SCOPE_CHANGED:${reason}`);
      expect(store.inspectTaskPlan({ bookId, kind: 'review-run', ref: prepared.reviewRunId }).start.readiness).toBe('changed');
      // Prepared again after it ended, the plan reads the item, is approved, and its result carries no marker.
      const again = prepare(store, bookId);
      approve(store, bookId, again);
      expect(run(store, bookId, again.reviewRunId).state).toBe('partial');
    });
  }, 300_000);

  it('says it cannot check the history when an exclusion record no longer reads, and 审阅 still opens (Issue #64 review)', async () => {
    await withSession(async ({ store, driver, seriesId }, bookId) => {
      const done = prepare(store, bookId);
      approve(store, bookId, done);
      await driver.drive(done.reviewRunId);
      exclude(store, seriesId, 'add', { target: { kind: 'knowledge-class', id: 'characters' }, reason: '人物另审' });
      const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
      try {
        db.exec('DROP TRIGGER series_retrieval_exclusions_no_update');
        db.exec("UPDATE series_retrieval_exclusions SET reason = '改过'");
        db.exec(SERIES_RETRIEVAL_EXCLUSION_TRIGGER_SQL.series_retrieval_exclusions_no_update!);
      } finally {
        db.close();
      }
      const opened = run(store, bookId, done.reviewRunId);
      expect([opened.state, opened.historicalMarker?.label, opened.findings.every((finding) => finding.historicalMarker === HISTORICAL_MARKER_UNVERIFIABLE)])
        .toEqual(['settled', HISTORICAL_MARKER_UNVERIFIABLE, true]);
    });
  }, 300_000);

  it('refuses the approval of a plan prepared before the exclusion, in the exclusion\'s words', async () => {
    await withSession(async ({ store, seriesId }, bookId) => {
      const prepared = prepare(store, bookId);
      exclude(store, seriesId, 'add', { target: { kind: 'knowledge-class', id: 'places' } });
      const reason = `「书系一致性」：${SERIES_RETRIEVAL_SCOPE_CHANGED_LABEL}——它所依据的知识类别「地点」在这次审阅准备之后被排除在书系检索之外；请重新准备这次审阅。`;
      expect(refusal(() => approve(store, bookId, prepared))).toBe(`SERIES_RETRIEVAL_SCOPE_CHANGED:${reason}`);
      const plan = store.inspectTaskPlan({ bookId, kind: 'review-run', ref: prepared.reviewRunId });
      expect(plan.start.readiness).toBe('changed');
      expect(run(store, bookId, prepared.reviewRunId).state).toBe('prepared');
    });
  }, 300_000);

  it('stops a Run reading now before its next range, keeps what it read, and never lets it go on', async () => {
    const held = gate();
    await withSession(async ({ store, driver, seriesId }, bookId) => {
      const itemId = itemOf(store, seriesId);
      const reviewing = prepare(store, bookId);
      approve(store, bookId, reviewing);
      const driven = driver.drive(reviewing.reviewRunId);
      await held.reached;
      // The first range is out; the exclusion is recorded while it is, and stops nothing at once — the guard does, next.
      const { preview, result } = exclude(store, seriesId, 'add', { target: { kind: 'knowledge-item', id: itemId } });
      expect(preview.groups[1]!.changes[0]).toContain('《星河之三》第 1 次审阅');
      expect(result.stoppedRuns).toBe(0);
      held.release();
      await driven;
      const stopped = run(store, bookId, reviewing.reviewRunId);
      expect([stopped.state, stopped.canContinue, stopped.categories[0]!.state, stopped.categories[0]!.stateLabel])
        .toEqual(['scope-changed', false, 'interrupted', SERIES_RETRIEVAL_SCOPE_CHANGED_LABEL]);
      expect(stopped.categories[0]!.detail?.startsWith(SERIES_SCOPE_STOP_SUMMARY)).toBe(true);
      // Exactly the one range that was out was read; nothing after it was sent, and nothing reached the manuscript.
      const ledger = store.inspectReviewWorkspace(bookId, reviewing.reviewRunId);
      expect(ledger.run!.findings).toHaveLength(0);
      const runRecordId = (() => {
        const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
        try {
          return (db.prepare('SELECT run_record_id FROM analysis_run_records WHERE task_intent_id = ?').get(reviewing.categories[0]!.taskIntentId!) as { run_record_id: string }).run_record_id;
        } finally {
          db.close();
        }
      })();
      expect(outcomeSummary(runRecordId).startsWith(SERIES_SCOPE_STOP_SUMMARY)).toBe(true);
      // The partial revision holds the one range read and the rest as gaps never attempted.
      const db = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
      try {
        const units = db.prepare(`SELECT u.state, count(*) count FROM analysis_unit_results u JOIN analysis_result_set_revisions r ON r.revision_id = u.revision_id
          WHERE r.run_record_id = ? GROUP BY u.state ORDER BY u.state`).all(runRecordId) as Array<{ state: string; count: number }>;
        expect(units.map((row) => [row.state, row.count])).toEqual([['closed', 1], ['gap', SAMPLE1_UNITS - 1]]);
      } finally {
        db.close();
      }
      expect(() => driver.continue(reviewing.reviewRunId)).toThrowError(/只能修改计划并重新授权，或取消任务/u);
      expect(run(store, bookId, reviewing.reviewRunId).state).toBe('scope-changed');
    }, held.hold);
  }, 300_000);

  it('marks a completed result that used material excluded afterwards, rewrites nothing, and keeps the marker once the exclusion ends', async () => {
    await withSession(async ({ store, driver, seriesId }, bookId) => {
      const itemId = itemOf(store, seriesId);
      const done = prepare(store, bookId);
      approve(store, bookId, done);
      await driver.drive(done.reviewRunId);
      const before = run(store, bookId, done.reviewRunId);
      expect([before.state, before.historicalMarker, before.findings.length]).toEqual(['settled', null, 3]);
      expect(before.findings.every((finding) => finding.historicalMarker === null)).toBe(true);

      const { preview } = exclude(store, seriesId, 'add', { target: { kind: 'knowledge-item', id: itemId } });
      expect(preview.groups[2]!.changes).toEqual([`1 个已完成的结果用过这些材料，会标上「${HISTORICALLY_AFFECTED_RESULT_MARKER}」：《星河之三》第 1 次审阅。`]);
      const after = run(store, bookId, done.reviewRunId);
      expect([after.state, after.historicalMarker?.label]).toEqual(['settled', HISTORICALLY_AFFECTED_RESULT_MARKER]);
      expect(after.findings.map((finding) => [finding.findingId, finding.note, finding.historicalMarker]))
        .toEqual(before.findings.map((finding) => [finding.findingId, finding.note, HISTORICALLY_AFFECTED_RESULT_MARKER]));
      expect(store.inspectReviewWorkspace(bookId, null).runs[0]!.historicalMarker).toBe(HISTORICALLY_AFFECTED_RESULT_MARKER);

      exclude(store, seriesId, 'end', { exclusionId: store.inspectSeries(seriesId).exclusions.effective[0]!.exclusionId });
      expect(run(store, bookId, done.reviewRunId).historicalMarker?.label).toBe(HISTORICALLY_AFFECTED_RESULT_MARKER);
      // A Run made after the exclusion ended reads the item again, and its result carries no marker.
      const again = prepare(store, bookId);
      approve(store, bookId, again);
      await driver.drive(again.reviewRunId);
      expect([run(store, bookId, again.reviewRunId).state, run(store, bookId, again.reviewRunId).historicalMarker]).toEqual(['settled', null]);
    });
  }, 300_000);
});
