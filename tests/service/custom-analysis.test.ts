import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import { sliceGraphemes } from '../../src/service/analysis/factual-review-contract.js';
import { ANALYSIS_RESULT_SET_REVISION_81_SQL, ANALYSIS_RESULT_SET_SCHEMA_SQL } from '../../src/service/analysis/result-set-schema.js';
import { CUSTOM_ANALYSIS_DIMENSION_SCHEMA_SQL } from '../../src/service/custom-analysis-dimensions.js';
import { MERGE_TABLE_POLICY } from '../../src/service/database-merge.js';
import { CUSTOM_ANALYSIS_SCHEMA_VERSION, IMPORTED_SKILL_SCHEMA_VERSION, LATEST_SCHEMA_VERSION, TASK_INTENT_DRAFT_SCHEMA_VERSION } from '../../src/service/task-authorization.js';
import { loadModelFixture, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import { CUSTOM_ANALYSIS_ASSURANCE_STATEMENT, type CustomAnalysisDimensionsProjection, type LaunchPolicyProjection } from '../../src/shared/protocol.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import { CUSTOM_DIMENSION_TEMPLATE, CUSTOM_DIMENSION_TITLE } from '../support/custom-analysis.js';
import { execPre74Fixture, restoreCustomAnalysisPredecessor } from '../support/pre74-schema.js';
import { importSample1Book, pinEditorialWorkspaceProfileRevision2, recordMissingCredentialConnection, requireExactSample1 } from '../support/sample1-baseline.js';

// Service-integration suite (L2) for 自定义分析维度 (Issue #922, slice 7f): the real store and ledger, the one execution owner and the
// AI7 local deterministic adapter over the authored fixture `sample1-custom-analysis-authored`, and a fake secret resolver. The
// manuscript is exact `sample1` (ADR 0043); no Provider, socket, credential value or Effect is involved. Assertions name counts,
// states and identities; the only text compared is the fixture's own quotation against the block it names.

const FIXTURES_ROOT = resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url)));

let roots: ServiceTestRoots;
let launchPolicy: LaunchPolicyProjection;
let fixture: ResolvedModelFixture;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-custom-analysis-');
  launchPolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
  fixture = await loadModelFixture(FIXTURES_ROOT, 'sample1-custom-analysis-authored');
  expect(fixture.provenance).toBe('authored');
});

afterEach(async () => {
  await roots.dispose();
});

interface Book {
  readonly store: EditorialStore;
  readonly owner: BaselineAnalysisExecutionOwner;
  readonly bookId: string;
  readonly manuscriptId: string;
  readonly revisionId: string;
}

async function withBook(body: (book: Book) => Promise<void>): Promise<void> {
  await requireExactSample1(roots.codeRoot);
  const store = await EditorialStore.open(roots.dataRoot, roots.codeRoot, {
    induceUnprovableReconciliation: false,
    persistLegacyReviewedDraft: false,
    induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false,
    interruptAfterAbandonObjectRemoval: false,
    baselineAnalysisRoute: { fixtureIdentity: fixture.identity, fixtureSha256: fixture.sha256, fixtureLineage: fixture.lineage },
  });
  const owner = new BaselineAnalysisExecutionOwner({ ledger: store.baselineAnalysisLedger, launchPolicy, fixture, secretResolver: { resolve: async () => null } });
  try {
    const imported = await importSample1Book(store, roots.codeRoot, 'L2 sample1 自定义分析');
    await pinEditorialWorkspaceProfileRevision2(store, imported.bookId);
    recordMissingCredentialConnection(store, 'L2 主编辑连接');
    await body({ store, owner, bookId: imported.bookId, manuscriptId: imported.manuscriptId, revisionId: imported.revisionId });
    store.markCleanShutdown();
  } finally {
    await owner.dispose();
    store.close();
  }
}

function refusal(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof StoreError) return error.code;
    throw error;
  }
  throw new Error('expected a refusal');
}

/** Save and enable the fixture's dimension; answer its identities. */
function defineDimension(book: Book, title = CUSTOM_DIMENSION_TITLE): { dimensionId: string; versionId: string } {
  const saved = book.store.saveCustomAnalysisDimension({ dimensionId: null, title, questionTemplate: CUSTOM_DIMENSION_TEMPLATE });
  const dimension = saved.dimensions.find((entry) => entry.title === title)!;
  book.store.enableCustomAnalysisDimension(dimension.versions[0]!.versionId);
  return { dimensionId: dimension.dimensionId, versionId: dimension.versions[0]!.versionId };
}

/** ②A 自定义 › 运行 then the drawer's 开始任务: prepare, authorize, dispatch on the Task's own ledger, settle. */
async function run(book: Book, dimensionId: string): Promise<string> {
  const prepared = book.store.prepareCustomAnalysis({ bookId: book.bookId, dimensionId, update: null }, launchPolicy);
  const task = book.store.inspectAnalysisTask(book.bookId, prepared.taskIntentId);
  expect(task.state).toBe('prepared');
  const authorized = book.store.authorizeBaselineAnalysis(book.bookId, prepared.taskIntentId, task.planEnvelope!.digest);
  expect(authorized.dispatchRunRecordId).not.toBeNull();
  book.owner.admitAndDispatch(authorized.dispatchRunRecordId!, authorized.ledger);
  await book.owner.whenIdle();
  expect(book.store.inspectAnalysisTask(book.bookId, prepared.taskIntentId).state).toBe('settled');
  return prepared.taskIntentId;
}

function custom(projection: CustomAnalysisDimensionsProjection, dimensionId: string) {
  return projection.dimensions.find((entry) => entry.dimensionId === dimensionId)!;
}

describe('the dimension ledger (schema revision 82)', () => {
  it('versions a dimension 待验证 → 已启用 → 已停用, supersedes its latest, keeps 停用 final and every row immutable', async () => {
    await withBook(async (book) => {
      const first = book.store.saveCustomAnalysisDimension({ dimensionId: null, title: CUSTOM_DIMENSION_TITLE, questionTemplate: CUSTOM_DIMENSION_TEMPLATE });
      const dimension = first.dimensions[0]!;
      expect(dimension.versions.map((version) => [version.version, version.state, version.supersedes])).toEqual([[1, 'pending-validation', null]]);
      expect(dimension.enabledVersion).toBeNull();
      const v1 = dimension.versions[0]!.versionId;
      expect(refusal(() => book.store.saveCustomAnalysisDimension({ dimensionId: dimension.dimensionId, title: CUSTOM_DIMENSION_TITLE, questionTemplate: CUSTOM_DIMENSION_TEMPLATE })))
        .toBe('CUSTOM_ANALYSIS_DIMENSION_UNCHANGED');
      const enabled = custom(book.store.enableCustomAnalysisDimension(v1), dimension.dimensionId);
      expect(enabled.enabledVersion).toEqual({ versionId: v1, version: 1 });
      expect(refusal(() => book.store.enableCustomAnalysisDimension(v1))).toBe('CUSTOM_ANALYSIS_DIMENSION_ENABLED');
      const second = custom(book.store.saveCustomAnalysisDimension({ dimensionId: dimension.dimensionId, title: '单元开篇（修订）', questionTemplate: CUSTOM_DIMENSION_TEMPLATE }), dimension.dimensionId);
      expect(second.title).toBe('单元开篇（修订）');
      expect(second.versions.map((version) => [version.version, version.state, version.supersedes?.version ?? null])).toEqual([[2, 'pending-validation', 1], [1, 'enabled', null]]);
      // The newest enabled version is what runs: version 1, until version 2 is enabled.
      expect(second.enabledVersion).toEqual({ versionId: v1, version: 1 });
      const stopped = custom(book.store.stopCustomAnalysisDimension(v1), dimension.dimensionId);
      expect(stopped.versions[1]!.state).toBe('stopped');
      expect(stopped.enabledVersion).toBeNull();
      expect(refusal(() => book.store.stopCustomAnalysisDimension(v1))).toBe('CUSTOM_ANALYSIS_DIMENSION_STOPPED');
      expect(refusal(() => book.store.enableCustomAnalysisDimension(v1))).toBe('CUSTOM_ANALYSIS_DIMENSION_STOPPED');
      expect(refusal(() => book.store.prepareCustomAnalysis({ bookId: book.bookId, dimensionId: dimension.dimensionId, update: null }, launchPolicy)))
        .toBe('CUSTOM_ANALYSIS_DIMENSION_NOT_ENABLED');
      // A Book lists a dimension it can run or has run: this one has neither.
      expect(book.store.inspectCustomAnalysisDimensions(book.bookId).dimensions).toEqual([]);
    });
    const path = join(roots.dataRoot, 'store', 'ai7.sqlite');
    const database = new DatabaseSync(path);
    try {
      expect(() => database.exec("UPDATE custom_analysis_dimension_versions SET version = 9")).toThrow('CUSTOM_ANALYSIS_DIMENSION_IMMUTABLE');
      expect(() => database.exec('DELETE FROM custom_analysis_dimension_states')).toThrow('CUSTOM_ANALYSIS_DIMENSION_IMMUTABLE');
      const stopped = database.prepare("SELECT version_id FROM custom_analysis_dimension_states WHERE state = 'stopped'").get() as { version_id: string };
      expect(() => database.prepare("INSERT INTO custom_analysis_dimension_states(version_id, sequence, state, recorded_at, canonical_json, sha256) VALUES (?, 9, 'enabled', 'x', '{}', ?)")
        .run(stopped.version_id, 'f'.repeat(64))).toThrow('CUSTOM_ANALYSIS_DIMENSION_STOPPED');
      for (const table of Object.keys(CUSTOM_ANALYSIS_DIMENSION_SCHEMA_SQL)) expect(MERGE_TABLE_POLICY[table]).toBe('house');
    } finally {
      database.close();
    }
  }, 120_000);

  it('refuses a template carrying a phrase of a Book\'s manuscript, a malformed one, and an unknown version', async () => {
    await withBook(async (book) => {
      const blocks = book.store.baselineAnalysisLedger.readRevisionBlocks(book.manuscriptId, book.revisionId);
      const phrase = sliceGraphemes(blocks.find((block) => block.text.length > 30)!.text, 0, 14);
      expect(refusal(() => book.store.saveCustomAnalysisDimension({ dimensionId: null, title: '回声', questionTemplate: `请判断${phrase}这句话的语气。` })))
        .toBe('CUSTOM_ANALYSIS_TEMPLATE_MANUSCRIPT_TEXT');
      expect(refusal(() => book.store.saveCustomAnalysisDimension({ dimensionId: null, title: '超长', questionTemplate: '问'.repeat(401) }))).toBe('CUSTOM_ANALYSIS_DIMENSION_INVALID');
      expect(refusal(() => book.store.saveCustomAnalysisDimension({ dimensionId: null, title: '占位', questionTemplate: '{作者}写了什么？' }))).toBe('CUSTOM_ANALYSIS_DIMENSION_INVALID');
      expect(refusal(() => book.store.enableCustomAnalysisDimension('99999999-9999-4999-8999-999999999999'))).toBe('CUSTOM_ANALYSIS_DIMENSION_NOT_FOUND');
      expect(book.store.inspectCustomAnalysisDimensions(null).dimensions).toEqual([]);
    });
  }, 120_000);
});

describe('a custom analysis Run over the real store on exact sample1', () => {
  it('finds a custom Connectivity Wait and reconnects on its exact version ledger', async () => {
    await withBook(async (book) => {
      const { dimensionId, versionId } = defineDimension(book);
      const prepared = book.store.prepareCustomAnalysis({ bookId: book.bookId, dimensionId, update: null }, launchPolicy);
      const task = book.store.inspectAnalysisTask(book.bookId, prepared.taskIntentId);
      book.store.startBaselineAnalysisWhenOnline(book.bookId, prepared.taskIntentId, task.planEnvelope!.digest);
      const waiting = book.store.waitingTaskRuns(book.bookId);
      expect(waiting).toHaveLength(1);
      const candidate = waiting[0]!;
      expect(candidate.ref).toBe(prepared.taskIntentId);
      expect(candidate.kind).toBe('baseline-analysis');
      expect(book.store.taskPreflightDrift(candidate)).toEqual([]);
      const ledger = book.store.waitingRunLedger({ ...candidate, kind: 'baseline-analysis' });
      expect(ledger.kind).toBe(`custom-analysis/${dimensionId}`);
      book.owner.admitAndDispatch(candidate.runRecordId, ledger, { afterReconnectPreflight: true });
      await book.owner.whenIdle();
      const latest = custom(book.store.inspectCustomAnalysisDimensions(book.bookId), dimensionId).book!.latest!;
      expect(latest.dimensionVersion.versionId).toBe(versionId);
      expect(latest.rowCounts.rows).toBe(9);
      expect(book.store.waitingTaskRuns(book.bookId)).toEqual([]);
      expect(book.store.inspectBaselineAnalysis(book.bookId).resultSetRevision).toBeNull();
    });
  }, 180_000);

  it('edits the pinned custom plan and keeps its version when a successor is enabled before the Run starts', async () => {
    await withBook(async (book) => {
      const first = defineDimension(book);
      const prepared = book.store.prepareCustomAnalysis({ bookId: book.bookId, dimensionId: first.dimensionId, update: null }, launchPolicy);
      const task = book.store.inspectAnalysisTask(book.bookId, prepared.taskIntentId);
      expect(task.authorization).toBeNull();
      expect(task.run).toBeNull();
      const edited = book.store.editBaselineAnalysisPlan({
        bookId: book.bookId, taskIntentId: prepared.taskIntentId, planEnvelopeDigest: task.planEnvelope!.digest,
        removedSteps: [], disallowedAdaptations: [], runBudgetCeiling: { kind: 'tokens', maxTotalTokens: 100_000 },
      });
      expect(edited.kind).toBe(`custom-analysis/${first.dimensionId}`);
      expect(edited.planVersion!.ordinal).toBe(2);
      expect(edited.planEnvelope!.digest).not.toBe(task.planEnvelope!.digest);
      const successor = custom(book.store.saveCustomAnalysisDimension({ dimensionId: first.dimensionId, title: '单元开篇（修订）', questionTemplate: CUSTOM_DIMENSION_TEMPLATE }), first.dimensionId).versions[0]!;
      book.store.enableCustomAnalysisDimension(successor.versionId);
      const pinned = book.store.inspectTaskPlan({ bookId: book.bookId, kind: 'baseline-analysis', ref: prepared.taskIntentId });
      expect(pinned.goal.chips.procedure).toContain('第 1 版');
      const authorized = book.store.authorizeBaselineAnalysis(book.bookId, prepared.taskIntentId, edited.planEnvelope!.digest);
      book.owner.admitAndDispatch(authorized.dispatchRunRecordId!, authorized.ledger);
      await book.owner.whenIdle();
      const previous = custom(book.store.inspectCustomAnalysisDimensions(book.bookId), first.dimensionId).book!.latest!;
      expect(previous.dimensionVersion.versionId).toBe(first.versionId);
      expect(previous.rowCounts.rows).toBe(9);
      const historical = JSON.stringify(book.store.inspectAnalysisTask(book.bookId, prepared.taskIntentId).resultSetRevision);
      const next = book.store.prepareCustomAnalysis({ bookId: book.bookId, dimensionId: first.dimensionId, update: { mode: 'reanalyze-range', selectedRange: { startPosition: 1, endPosition: 1 } } }, launchPolicy);
      const nextTask = book.store.inspectAnalysisTask(book.bookId, next.taskIntentId);
      expect(nextTask.planEnvelope!.promptContractDigest).not.toBe(edited.planEnvelope!.promptContractDigest);
      expect(nextTask.update!.reusePlan!.counts.reused).toBe(0);
      expect(JSON.stringify(nextTask.resultSetRevision) === historical).toBe(true);
      expect(book.store.inspectBaselineAnalysis(book.bookId).resultSetRevision).toBeNull();
      // Stopping the old version keeps the completed result exactly pinned.
      book.store.stopCustomAnalysisDimension(first.versionId);
      expect(custom(book.store.inspectCustomAnalysisDimensions(book.bookId), first.dimensionId).book!.latest!.dimensionVersion.versionId).toBe(first.versionId);
    });
  }, 180_000);

  it('runs through prepare → 开始任务 → fixture execution into a Result Set Revision keyed by the family, rows anchored or said unlocated', async () => {
    await withBook(async (book) => {
      const { dimensionId, versionId } = defineDimension(book);
      const before = custom(book.store.inspectCustomAnalysisDimensions(book.bookId), dimensionId);
      expect(before.book).toEqual({ taskState: null, latest: null, unavailableReason: null });
      const taskIntentId = await run(book, dimensionId);
      // The plan the Task Drawer showed names the dimension version and its template (会发送 on a live route only).
      const plan = book.store.inspectTaskPlan({ bookId: book.bookId, kind: 'baseline-analysis', ref: taskIntentId });
      expect(plan.goal.chips.procedure).toBe(`自定义分析 · ${CUSTOM_DIMENSION_TITLE} · 第 1 版`);
      expect(plan.scope.send).toContain(`该维度第 1 版的提问模板「${CUSTOM_DIMENSION_TEMPLATE}」`);
      expect(plan.technical.some((row) => row.key === 'custom-analysis-dimension' && row.value.startsWith(versionId))).toBe(true);
      const settled = book.store.inspectAnalysisTask(book.bookId, taskIntentId);
      expect(settled.kind).toBe(`custom-analysis/${dimensionId}`);
      expect(settled.taskOutcome?.classification).toBe('completed');
      const revision = settled.resultSetRevision as unknown as Record<string, unknown> & { assurance: { statement: string } };
      expect(revision.contractVersion).toBe('ai7.custom-analysis/1');
      expect(revision.dimension).toEqual({ dimensionId, versionId, version: 1, documentDigest: before.versions[0]!.documentDigest });
      expect(revision.assurance.statement).toBe(CUSTOM_ANALYSIS_ASSURANCE_STATEMENT);
      const tab = custom(book.store.inspectCustomAnalysisDimensions(book.bookId), dimensionId);
      const latest = tab.book!.latest!;
      expect(latest.coverage.state).toBe('complete');
      expect(latest.freshness.state).toBe('current');
      expect(latest.rowCounts).toEqual({ units: 8, rows: 9, located: 8, unlocated: 1 });
      expect(latest.rows.filter((row) => row.anchorState === 'not-found').map((row) => row.unitOrdinal)).toEqual([3]);
      expect(tab.versions[0]!.taskCount).toBe(1);
      // Every located row's range holds exactly its quotation in the text the Task read.
      const blocks = new Map(book.store.baselineAnalysisLedger.readRevisionBlocks(book.manuscriptId, book.revisionId).map((block) => [block.blockId, block.text] as const));
      for (const row of latest.rows.filter((entry) => entry.sourceRange !== null)) {
        expect(sliceGraphemes(blocks.get(row.sourceRange!.blockId)!, row.sourceRange!.fromGrapheme, row.sourceRange!.toGrapheme) === row.quote).toBe(true);
      }
    });
    const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'), { readOnly: true });
    try {
      const sets = database.prepare('SELECT kind FROM analysis_result_sets').all() as Array<{ kind: string }>;
      expect(sets).toHaveLength(1);
      expect(sets[0]!.kind).toMatch(/^custom-analysis\/[0-9a-f-]{36}$/u);
    } finally {
      database.close();
    }
  }, 180_000);

  it('keeps a second dimension\'s Result Set apart (ANALYSIS-009), and a stopped version refuses new Runs and keeps its history', async () => {
    await withBook(async (book) => {
      const first = defineDimension(book);
      // The same document under another dimension: the same contract, so the same fixture answers; its own kind and Result Set.
      const second = defineDimension(book, '单元开篇（第二个维度）');
      await run(book, first.dimensionId);
      expect(custom(book.store.inspectCustomAnalysisDimensions(book.bookId), second.dimensionId).book!.latest).toBeNull();
      const firstRevision = custom(book.store.inspectCustomAnalysisDimensions(book.bookId), first.dimensionId).book!.latest!.revisionId;
      await run(book, second.dimensionId);
      const both = book.store.inspectCustomAnalysisDimensions(book.bookId);
      expect(custom(both, first.dimensionId).book!.latest!.revisionId).toBe(firstRevision);
      expect(custom(both, second.dimensionId).book!.latest!.ordinal).toBe(1);
      expect(custom(both, second.dimensionId).book!.latest!.revisionId).not.toBe(firstRevision);
      // A Task prepared under a version stopped before 开始任务 is refused: the second dimension read again whole, then stopped.
      const prepared = book.store.prepareCustomAnalysis({ bookId: book.bookId, dimensionId: second.dimensionId, update: { mode: 'reanalyze-book', selectedRange: null } }, launchPolicy);
      const task = book.store.inspectAnalysisTask(book.bookId, prepared.taskIntentId);
      book.store.stopCustomAnalysisDimension(second.versionId);
      expect(refusal(() => book.store.authorizeBaselineAnalysis(book.bookId, prepared.taskIntentId, task.planEnvelope!.digest))).toBe('CUSTOM_ANALYSIS_DIMENSION_STOPPED');
      // The first dimension stopped after its Run: no new Run, its revision kept and still naming the version it ran under.
      book.store.stopCustomAnalysisDimension(first.versionId);
      expect(refusal(() => book.store.prepareCustomAnalysis({ bookId: book.bookId, dimensionId: first.dimensionId, update: null }, launchPolicy)))
        .toBe('CUSTOM_ANALYSIS_DIMENSION_NOT_ENABLED');
      const listed = book.store.inspectCustomAnalysisDimensions(book.bookId);
      const kept = custom(listed, first.dimensionId);
      expect(kept.enabledVersion).toBeNull();
      expect(kept.book!.latest!.dimensionVersion.versionId).toBe(first.versionId);
      expect(kept.book!.unavailableReason).toContain('没有已启用的版本');
      // The second dimension still lists, its prepared Task never started and its first revision kept.
      expect(custom(listed, second.dimensionId).book!.taskState?.state).toBe('prepared');
      expect(custom(listed, second.dimensionId).book!.latest!.ordinal).toBe(1);
    });
  }, 180_000);
});

describe('baseline and custom analysis on the same launch', () => {
  it('answers every unit of the dimension after the first baseline of the Book on the same launch', async () => {
    await withBook(async (book) => {
      let progress = book.store.createBaselineAnalysisPreparationWork(book.bookId, '对当前书稿执行基线稿件分析，形成覆盖全部结构单元的结果集修订版。', null, launchPolicy);
      while (!progress.done) progress = book.store.advanceBaselineAnalysisPreparationWork(progress.workId!);
      const authorized = book.store.authorizeBaselineAnalysis(book.bookId, progress.projection!.taskIntent!.taskIntentId, progress.projection!.planEnvelope!.digest);
      book.owner.admitAndDispatch(authorized.dispatchRunRecordId!, authorized.ledger);
      await book.owner.whenIdle();
      const { dimensionId } = defineDimension(book);
      await run(book, dimensionId);
      const latest = custom(book.store.inspectCustomAnalysisDimensions(book.bookId), dimensionId).book!.latest!;
      expect(latest.gaps).toEqual([]);
      expect(latest.rowCounts).toEqual({ units: 8, rows: 9, located: 8, unlocated: 1 });
    });
  }, 180_000);
});

describe('schema revision 82', () => {
  it.each([TASK_INTENT_DRAFT_SCHEMA_VERSION, IMPORTED_SKILL_SCHEMA_VERSION])('rebuilds revision %i Result Set relations byte for byte, adds dimensions empty, and refuses a terminal store without them', async (predecessor) => {
    // Synchronized with #89: imported-Skill update ledgers follow revision 82 without rebuilding its relations.
    expect(LATEST_SCHEMA_VERSION).toBe(91);
    let bookId = '';
    await withBook(async (book) => {
      bookId = book.bookId;
      // A baseline Result Set Revision the rebuild must carry: the fixture's base answers the first baseline.
      let progress = book.store.createBaselineAnalysisPreparationWork(book.bookId, '对当前书稿执行基线稿件分析，形成覆盖全部结构单元的结果集修订版。', null, launchPolicy);
      while (!progress.done) progress = book.store.advanceBaselineAnalysisPreparationWork(progress.workId!);
      const authorized = book.store.authorizeBaselineAnalysis(book.bookId, progress.projection!.taskIntent!.taskIntentId, progress.projection!.planEnvelope!.digest);
      book.owner.admitAndDispatch(authorized.dispatchRunRecordId!, authorized.ledger);
      await book.owner.whenIdle();
      expect(book.store.inspectBaselineAnalysis(book.bookId).resultSetRevision).not.toBeNull();
    });
    const path = join(roots.dataRoot, 'store', 'ai7.sqlite');
    const plant = new DatabaseSync(path);
    const sets = plant.prepare('SELECT rowid, * FROM analysis_result_sets ORDER BY rowid').all();
    const revisions = plant.prepare('SELECT rowid, * FROM analysis_result_set_revisions ORDER BY rowid').all();
    const plans = plant.prepare('SELECT rowid, * FROM analysis_plan_records ORDER BY rowid').all();
    expect(sets).toHaveLength(1);
    restoreCustomAnalysisPredecessor(plant);
    execPre74Fixture(plant, `PRAGMA user_version = ${predecessor}`);
    expect((plant.prepare("SELECT sql FROM sqlite_schema WHERE name = 'analysis_result_sets'").get() as { sql: string }).sql).toBe(ANALYSIS_RESULT_SET_REVISION_81_SQL.analysis_result_sets);
    plant.close();
    const reopened = await EditorialStore.open(roots.dataRoot, roots.codeRoot);
    try {
      expect(reopened.inspectBaselineAnalysis(bookId).resultSetRevision).not.toBeNull();
      reopened.markCleanShutdown();
    } finally {
      reopened.close();
    }
    const migrated = new DatabaseSync(path);
    try {
      // Synchronized with #89: revision 83 adds imported-Skill update ledgers after this revision's migration.
      expect(migrated.prepare('PRAGMA user_version').get()).toEqual({ user_version: 91 });
      for (const table of ['analysis_result_sets', 'analysis_result_set_revisions'] as const) {
        expect((migrated.prepare(`SELECT sql FROM sqlite_schema WHERE name = '${table}'`).get() as { sql: string }).sql).toBe(ANALYSIS_RESULT_SET_SCHEMA_SQL[table]);
      }
      expect(JSON.stringify(migrated.prepare('SELECT rowid, * FROM analysis_result_sets ORDER BY rowid').all()) === JSON.stringify(sets)).toBe(true);
      expect(JSON.stringify(migrated.prepare('SELECT rowid, * FROM analysis_result_set_revisions ORDER BY rowid').all()) === JSON.stringify(revisions)).toBe(true);
      expect(JSON.stringify(migrated.prepare('SELECT rowid, * FROM analysis_plan_records ORDER BY rowid').all()) === JSON.stringify(plans)).toBe(true);
      for (const table of Object.keys(CUSTOM_ANALYSIS_DIMENSION_SCHEMA_SQL)) {
        expect((migrated.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n).toBe(0);
      }
      migrated.exec('DROP TABLE custom_analysis_dimension_states');
    } finally {
      migrated.close();
    }
    await expect(EditorialStore.open(roots.dataRoot, roots.codeRoot)).rejects.toThrow();
  }, 180_000);
});
