import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EditorialStore, StoreError } from '../../src/service/store.js';
import { resolveSourceCheckoutLaunchPolicy } from '../../src/service/launch-policy.js';
import { BaselineAnalysisExecutionOwner } from '../../src/service/analysis/execution.js';
import { BASELINE_PROMPT_CONTRACT_DIGEST, unitRequestDigest } from '../../src/service/analysis/contract.js';
import { fixtureEntryKey, loadModelFixture, type ResolvedModelFixture } from '../../src/service/provider/model-fixture.js';
import type { SecretResolver } from '../../src/service/provider/credential-broker.js';
import {
  ANALYSIS_LEDGER_REVISION_15_SQL,
  ANALYSIS_LEDGER_REVISION_16_SQL,
  ANALYSIS_LEDGER_REVISION_19_SQL,
  ANALYSIS_LEDGER_REVISION_17_TABLES,
  ANALYSIS_LEDGER_SCHEMA_SQL,
  ANALYSIS_LEDGER_TRIGGER_SQL,
  J04_BASELINE_ANALYSIS_SCHEMA_VERSION,
  SUCCESSIVE_TASK_SCHEMA_VERSION,
  FACTUAL_REVIEW_SCHEMA_VERSION,
  TEXT_CONVERSION_SCHEMA_VERSION,
  TASK_AUTHORIZATION_SCHEMA_SQL,
} from '../../src/service/task-authorization.js';
import {
  BASELINE_ANALYSIS_MODE_GOALS,
  BASELINE_ANALYSIS_TASK_GOAL,
  J03_TASK_GOAL,
  type AnalysisReusePlanProjection,
  type BaselineAnalysisProjection,
  type BaselineAnalysisUpdateRequest,
  type CoverageManifestProjection,
  type JournalAcknowledgement,
  type LaunchPolicyProjection,
} from '../../src/shared/protocol.js';
import { canonicalJson, sha256Hex } from '../../src/service/analysis/canonical.js';
import {
  PRE_RUN_REPORT_REASON,
  runReportAccountingDigest,
  runReportAccountingOf,
  runReportDigest,
  runReportUsageReconciles,
} from '../../src/service/analysis/run-report.js';
import { RUN_REPORT_STAGES } from '../../src/shared/protocol.js';
import { createServiceTestRoots, type ServiceTestRoots } from '../support/temp-data-root.js';
import {
  SAMPLE1_BLOCKS,
  SAMPLE1_UNITS,
  importSample1Book,
  pinEditorialWorkspaceProfileRevision2,
  recordMissingCredentialConnection,
  requireExactSample1,
} from '../support/sample1-baseline.js';

// Service-integration suite (L2) for the covered baseline analysis: the real store, the real pinned
// DSH composition, the AI7 local deterministic adapter over fixture (i)+(ii), and a fake secret
// resolver. The manuscript is exact `sample1` (ADR 0043); no Provider, socket, credential value, or
// Effect is involved, and nothing here reads the DOCX outside the supported import path.

const FIXTURES_ROOT = resolve(fileURLToPath(new URL('../fixtures/model/', import.meta.url)));
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;

let roots: ServiceTestRoots;
let launchPolicy: LaunchPolicyProjection;
let fixture: ResolvedModelFixture;

beforeEach(async () => {
  roots = await createServiceTestRoots('ai7-service-analysis-');
  launchPolicy = await resolveSourceCheckoutLaunchPolicy(roots.codeRoot);
  expect(launchPolicy.integrityState).toBe('verified');
  fixture = await loadModelFixture(FIXTURES_ROOT, 'sample1-baseline-one-unit-failure');
});

afterEach(async () => {
  await roots.dispose();
});

function openWithRoute(dataRoot: string, route: ResolvedModelFixture | null): Promise<EditorialStore> {
  return EditorialStore.open(dataRoot, roots.codeRoot, {
    induceUnprovableReconciliation: false,
    persistLegacyReviewedDraft: false,
    induceReimportProofTamper: false,
    induceAbandonObjectRemovalFailure: false,
    interruptAfterAbandonObjectRemoval: false,
    baselineAnalysisRoute: route === null ? null : { fixtureIdentity: route.identity, fixtureSha256: route.sha256, fixtureLineage: route.lineage },
  });
}

function fakeSecretResolver(): SecretResolver & { reads: string[] } {
  const reads: string[] = [];
  return { reads, resolve: async (reference) => { reads.push(reference); return null; } };
}

function prepare(store: EditorialStore, bookId: string, update: BaselineAnalysisUpdateRequest | null = null): BaselineAnalysisProjection {
  const goal = update === null ? BASELINE_ANALYSIS_TASK_GOAL : BASELINE_ANALYSIS_MODE_GOALS[update.mode];
  let progress = store.createBaselineAnalysisPreparationWork(bookId, goal, update, launchPolicy);
  while (!progress.done) progress = store.advanceBaselineAnalysisPreparationWork(progress.workId!);
  expect(progress.projection).not.toBeNull();
  return progress.projection!;
}

async function settle(owner: BaselineAnalysisExecutionOwner, store: EditorialStore, bookId: string): Promise<BaselineAnalysisProjection> {
  await owner.whenIdle();
  return store.inspectBaselineAnalysis(bookId, (runRecordId) => owner.progressFor(runRecordId));
}

/** The exact acknowledged edit J-04 makes: the suffix appended to the end of the first block. */
const J04_EDIT_SUFFIX = '，J-04 结果集形成后的确认编辑';

function appendToFirstBlock(store: EditorialStore, manuscriptId: string, branchId: string, suffix: string): JournalAcknowledgement {
  const window = store.getManuscriptWindow(manuscriptId, branchId, null);
  const block = window.blocks[0]!;
  const graphemes = store.baselineAnalysisLedger.readWorkingBlocks(branchId).find((entry) => entry.blockId === block.blockId)!.graphemes;
  return store.flushJournalEdit({
    clientEditId: randomUUID(),
    manuscriptId,
    branchId,
    baseRevisionId: window.revisionId,
    blockId: block.blockId,
    windowStartBlockId: block.blockId,
    baseBlockDigest: block.digest,
    expectedJournalSequence: window.journalSequence,
    fromGrapheme: graphemes,
    toGrapheme: graphemes,
    insertText: suffix,
  });
}

async function runToSettled(
  store: EditorialStore,
  owner: BaselineAnalysisExecutionOwner,
  bookId: string,
  update: BaselineAnalysisUpdateRequest | null,
): Promise<{ prepared: BaselineAnalysisProjection; settled: BaselineAnalysisProjection }> {
  const prepared = prepare(store, bookId, update);
  const authorized = store.authorizeBaselineAnalysis(bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
  expect(authorized.dispatchRunRecordId).not.toBeNull();
  owner.admitAndDispatch(authorized.dispatchRunRecordId!);
  const settled = await settle(owner, store, bookId);
  return { prepared, settled };
}

/** The `(unit ordinal, request digest)` pairs a plan's recomputed units need and the fixture lacks; must be empty. */
function missingFixtureEntries(manifest: CoverageManifestProjection, plan: AnalysisReusePlanProjection): Array<{ unitOrdinal: number; requestDigest: string }> {
  return plan.units.filter((unit) => unit.disposition === 'recomputed').map((unit) => {
    const manifestUnit = manifest.units[unit.unitOrdinal - 1]!;
    return { unitOrdinal: unit.unitOrdinal, requestDigest: unitRequestDigest(BASELINE_PROMPT_CONTRACT_DIGEST, unit.unitOrdinal, manifestUnit.digest) };
  }).filter((entry) => !fixture.entries.has(fixtureEntryKey(entry.unitOrdinal, entry.requestDigest)));
}

function withoutFreshness<T extends { freshness: unknown }>(value: T): Omit<T, 'freshness'> {
  const { freshness: _freshness, ...rest } = value;
  return rest;
}

type Row = Record<string, unknown>;

function tableRows(database: DatabaseSync, table: string, columns = '*'): Row[] {
  return database.prepare(`SELECT ${columns} FROM ${table} ORDER BY rowid`).all() as Row[];
}

const REVISION_15_INTENT_COLUMNS = 'task_intent_id, book_id, kind, contract_version, goal, created_at, canonical_json, sha256';
const PRE_17_PLAN_COLUMNS = 'task_intent_id, component, canonical_json, sha256, created_at';

/** Drop the three revision-17 relations and rebuild `analysis_plan_records` in its exact revision-16 shape (plan version 1 only). */
function downgradePlanRecordsToRevision16(database: DatabaseSync): void {
  for (const table of [...ANALYSIS_LEDGER_REVISION_17_TABLES].reverse()) database.exec(`DROP TABLE ${table}`);
  database.exec('CREATE TEMP TABLE downgrade_plans AS SELECT rowid AS r, * FROM analysis_plan_records WHERE plan_version = 1');
  database.exec('DROP TABLE analysis_plan_records');
  database.exec(ANALYSIS_LEDGER_REVISION_16_SQL.analysis_plan_records);
  database.exec(`INSERT INTO analysis_plan_records(${PRE_17_PLAN_COLUMNS}) SELECT ${PRE_17_PLAN_COLUMNS} FROM temp.downgrade_plans ORDER BY r`);
  database.exec('DROP TABLE temp.downgrade_plans');
  database.exec(ANALYSIS_LEDGER_TRIGGER_SQL['analysis_plan_records_no_update']!);
  database.exec(ANALYSIS_LEDGER_TRIGGER_SQL['analysis_plan_records_no_delete']!);
}

/** Rebuild the revision-17 store in its exact revision-16 shape and stamp it as revision 16. */
function downgradeToRevision16(databasePath: string): void {
  const database = new DatabaseSync(databasePath);
  try {
    database.exec('PRAGMA foreign_keys = OFF');
    database.exec('BEGIN IMMEDIATE');
    downgradePlanRecordsToRevision16(database);
    database.exec(`PRAGMA user_version = ${SUCCESSIVE_TASK_SCHEMA_VERSION}`);
    database.exec('COMMIT');
    database.exec('PRAGMA foreign_keys = ON');
  } finally {
    database.close();
  }
}

const REVISION_19_INTENT_COLUMNS =
  'task_intent_id, book_id, kind, contract_version, goal, created_at, canonical_json, sha256, mode, predecessor_revision_id, selected_start_position, selected_end_position';
const RESULT_SET_COLUMNS = 'result_set_id, book_id, kind, created_at, canonical_json, sha256';
const RESULT_SET_REVISION_COLUMNS =
  'revision_id, result_set_id, ordinal, task_intent_id, run_record_id, attempt_id, manuscript_revision_id, manuscript_revision_digest, coverage_manifest_sha256, contract_version, created_at, canonical_json, sha256';

/** Rebuild one relation in an exact earlier shape with every row copied in its original order. */
function downgradeRelation(database: DatabaseSync, table: string, sql: string, columns: string): void {
  database.exec(`CREATE TEMP TABLE downgrade_${table} AS SELECT rowid AS r, * FROM ${table}`);
  database.exec(`DROP TABLE ${table}`);
  database.exec(sql);
  database.exec(`INSERT INTO ${table}(${columns}) SELECT ${columns} FROM temp.downgrade_${table} ORDER BY r`);
  database.exec(`DROP TABLE temp.downgrade_${table}`);
  database.exec(ANALYSIS_LEDGER_TRIGGER_SQL[`${table}_no_update`]!);
  database.exec(ANALYSIS_LEDGER_TRIGGER_SQL[`${table}_no_delete`]!);
}

const TASK_OUTCOME_COLUMNS =
  'outcome_id, task_intent_id, run_record_id, classification, result_set_revision_id, recorded_at, canonical_json, sha256';

/**
 * Rewrite every Task Outcome as one recorded before Issue #276: the same row, the same relation, and
 * a canonical JSON with no `report` and no `reportDigest`. It is how a store that predates the Run
 * Report actually looks, and nothing in the product ever performs this — the outcomes relation is
 * insert-only, and history is read as what it is rather than rewritten to add a report.
 */
function stripRunReportsFromOutcomes(databasePath: string): void {
  const database = new DatabaseSync(databasePath);
  try {
    database.exec('PRAGMA foreign_keys = OFF');
    database.exec('BEGIN IMMEDIATE');
    const rows = tableRows(database, 'analysis_task_outcomes');
    database.exec('DROP TABLE analysis_task_outcomes');
    database.exec(ANALYSIS_LEDGER_SCHEMA_SQL.analysis_task_outcomes);
    const insert = database.prepare(
      `INSERT INTO analysis_task_outcomes(${TASK_OUTCOME_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const row of rows) {
      const { report: _report, reportDigest: _digest, ...body } = JSON.parse(String(row.canonical_json)) as Record<string, unknown>;
      const json = canonicalJson(body);
      insert.run(String(row.outcome_id), String(row.task_intent_id), String(row.run_record_id), String(row.classification),
        row.result_set_revision_id === null ? null : String(row.result_set_revision_id), String(row.recorded_at), json, sha256Hex(json));
    }
    database.exec(ANALYSIS_LEDGER_TRIGGER_SQL['analysis_task_outcomes_no_update']!);
    database.exec(ANALYSIS_LEDGER_TRIGGER_SQL['analysis_task_outcomes_no_delete']!);
    database.exec('COMMIT');
    database.exec('PRAGMA foreign_keys = ON');
  } finally {
    database.close();
  }
}

/** Rebuild the revision-20 store in its exact revision-19 shape (one analysis kind) and stamp it as revision 19. */
function downgradeToRevision19(databasePath: string): void {
  const database = new DatabaseSync(databasePath);
  try {
    database.exec('PRAGMA foreign_keys = OFF');
    database.exec('BEGIN IMMEDIATE');
    downgradeRelation(database, 'analysis_result_set_revisions', ANALYSIS_LEDGER_REVISION_19_SQL.analysis_result_set_revisions, RESULT_SET_REVISION_COLUMNS);
    downgradeRelation(database, 'analysis_result_sets', ANALYSIS_LEDGER_REVISION_19_SQL.analysis_result_sets, RESULT_SET_COLUMNS);
    downgradeRelation(database, 'analysis_task_intents', ANALYSIS_LEDGER_REVISION_19_SQL.analysis_task_intents, REVISION_19_INTENT_COLUMNS);
    database.exec(`PRAGMA user_version = ${TEXT_CONVERSION_SCHEMA_VERSION}`);
    database.exec('COMMIT');
    database.exec('PRAGMA foreign_keys = ON');
  } finally {
    database.close();
  }
}

/** Rebuild the revision-17 store in its exact revision-15 shape (the two rev-16 relations as rev 15) and stamp it as revision 15. */
function downgradeToRevision15(databasePath: string): void {
  const database = new DatabaseSync(databasePath);
  try {
    database.exec('PRAGMA foreign_keys = OFF');
    database.exec('BEGIN IMMEDIATE');
    downgradePlanRecordsToRevision16(database);
    database.exec('CREATE TEMP TABLE downgrade_intents AS SELECT rowid AS r, * FROM analysis_task_intents');
    database.exec('DROP TABLE analysis_task_intents');
    database.exec(ANALYSIS_LEDGER_REVISION_15_SQL.analysis_task_intents);
    database.exec(`INSERT INTO analysis_task_intents(${REVISION_15_INTENT_COLUMNS}) SELECT ${REVISION_15_INTENT_COLUMNS} FROM temp.downgrade_intents ORDER BY r`);
    database.exec('DROP TABLE temp.downgrade_intents');
    database.exec(ANALYSIS_LEDGER_TRIGGER_SQL['analysis_task_intents_no_update']!);
    database.exec(ANALYSIS_LEDGER_TRIGGER_SQL['analysis_task_intents_no_delete']!);
    database.exec('CREATE TEMP TABLE downgrade_plans_15 AS SELECT rowid AS r, * FROM analysis_plan_records');
    database.exec('DROP TABLE analysis_plan_records');
    database.exec(ANALYSIS_LEDGER_REVISION_15_SQL.analysis_plan_records);
    database.exec(`INSERT INTO analysis_plan_records(${PRE_17_PLAN_COLUMNS}) SELECT ${PRE_17_PLAN_COLUMNS} FROM temp.downgrade_plans_15 ORDER BY r`);
    database.exec('DROP TABLE temp.downgrade_plans_15');
    database.exec(ANALYSIS_LEDGER_TRIGGER_SQL['analysis_plan_records_no_update']!);
    database.exec(ANALYSIS_LEDGER_TRIGGER_SQL['analysis_plan_records_no_delete']!);
    database.exec(`PRAGMA user_version = ${J04_BASELINE_ANALYSIS_SCHEMA_VERSION}`);
    database.exec('COMMIT');
    database.exec('PRAGMA foreign_keys = ON');
  } finally {
    database.close();
  }
}

describe('baseline manuscript analysis over the real store on exact sample1', () => {
  it('executes the authorized Run through the real path and reaches one immutable Result Set Revision', async () => {
    await requireExactSample1(roots.codeRoot);
    const resolver = fakeSecretResolver();
    const store = await openWithRoute(roots.dataRoot, fixture);
    const owner = new BaselineAnalysisExecutionOwner({ ledger: store.baselineAnalysisLedger, launchPolicy, fixture, secretResolver: resolver });
    let bookId: string;
    let revisionId: string;
    let attemptId: string;
    let reportJson: string;
    try {
      const imported = await importSample1Book(store, roots.codeRoot, 'L2 sample1 基线分析');
      bookId = imported.bookId;

      // Before the preconditions exist the surface stays closed, exactly like J-03's.
      expect(() => store.inspectBaselineAnalysis(bookId)).toThrowError(StoreError);
      await pinEditorialWorkspaceProfileRevision2(store, bookId);
      const credentialReference = recordMissingCredentialConnection(store, 'L2 主编辑连接');

      const available = store.inspectBaselineAnalysis(bookId);
      expect(available.state).toBe('available');
      expect(available.actions).toEqual({ canPrepare: true, canAuthorize: false, canReconfirmPlan: false });
      expect(available.namedNonEffects.some((statement) => statement.includes('Enrollment'))).toBe(true);

      const prepared = prepare(store, bookId);
      expect(prepared.state).toBe('prepared');
      expect(prepared.taskIntent?.goal).toBe(BASELINE_ANALYSIS_TASK_GOAL);
      expect(prepared.checkpoint?.revisionId).toBe(imported.revisionId);
      expect(prepared.checkpoint?.createdForDirtyJournal).toBe(false);
      const manifest = prepared.coverageManifest!;
      expect(manifest.totalBlocks).toBe(SAMPLE1_BLOCKS);
      expect(manifest.units).toHaveLength(SAMPLE1_UNITS);
      expect(manifest.units.map((unit) => unit.ordinal)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      expect(manifest.units.every((unit) => unit.graphemes <= manifest.parameters.unitBudgetGraphemes)).toBe(true);
      expect(manifest.units.slice(1).every((unit) => unit.overlapBlockIds.length === manifest.parameters.overlapBlocks)).toBe(true);
      expect(manifest.digest).toMatch(DIGEST_PATTERN);
      // The fixture is keyed by the exact unit ordinals and request digests this manifest derives.
      for (const unit of manifest.units) {
        const requestDigest = unitRequestDigest(BASELINE_PROMPT_CONTRACT_DIGEST, unit.ordinal, unit.digest);
        expect(fixture.entries.get(fixtureEntryKey(unit.ordinal, requestDigest))?.requestDigest).toBe(requestDigest);
      }
      expect(prepared.providerResolutionPlan?.remoteBinding.credentialReference).toBe(credentialReference);
      expect(prepared.providerResolutionPlan?.remoteBinding.credentialReadiness).toBe('missing');
      expect(prepared.providerResolutionPlan?.remoteBinding.providerProcessing).toEqual({ operationalScope: 'development-ci', version: 'v1', decision: 'deny', authorizedLiveTransmissionCount: 0 });
      expect(prepared.providerResolutionPlan?.executionRoute).toMatchObject({ kind: 'ai7-local-deterministic', fixtureIdentity: 'sample1-baseline-one-unit-failure', fixtureSha256: fixture.sha256 });
      expect(prepared.planEnvelope).toMatchObject({ dispatchAllowed: true, providerStatus: 'remote-denied-local-deterministic', promptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST });
      expect(prepared.executionPlan?.unitCount).toBe(SAMPLE1_UNITS);
      expect(prepared.actions).toEqual({ canPrepare: false, canAuthorize: true, canReconfirmPlan: false });
      // Preparing again returns the frozen plan.
      expect(prepare(store, bookId).planEnvelope?.digest).toBe(prepared.planEnvelope!.digest);

      const authorized = store.authorizeBaselineAnalysis(bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
      expect(authorized.projection.authorization).toMatchObject({ origin: 'standard-direct', authority: 'standard-direct-dispatch' });
      expect(authorized.projection.run?.state).toBe('authorized');
      expect(authorized.dispatchRunRecordId).toBe(authorized.projection.run!.runRecordId);
      owner.admitAndDispatch(authorized.dispatchRunRecordId!);
      const admitted = store.inspectBaselineAnalysis(bookId, (runRecordId) => owner.progressFor(runRecordId));
      expect(['admitted', 'executing']).toContain(admitted.state);
      expect(admitted.run?.progress).toMatchObject({ unitsTotal: SAMPLE1_UNITS });
      expect(() => owner.admitAndDispatch(authorized.dispatchRunRecordId!)).toThrowError(/EXECUTION_BUSY|一次只执行一个运行/u);

      const settled = await settle(owner, store, bookId);
      expect(settled.state).toBe('settled');
      expect(settled.run?.state).toBe('completed-with-gaps');
      expect(settled.run?.transitions.map((transition) => transition.state)).toEqual(['authorized', 'admitted', 'executing', 'completed-with-gaps']);
      const attempt = settled.run!.attempt!;
      attemptId = attempt.attemptId;
      expect(attempt.credentialReadinessCheck).toEqual({ slot: 'deepseek-api-key', readiness: 'missing', valueReleased: false });
      expect(resolver.reads).toEqual([credentialReference]);
      const binding = attempt.executionBinding!;
      expect(binding).toMatchObject({
        planEnvelopeDigest: prepared.planEnvelope!.digest,
        coverageManifestDigest: manifest.digest,
        promptContractDigest: BASELINE_PROMPT_CONTRACT_DIGEST,
        behaviorCompositionDigest: prepared.planEnvelope!.behaviorCompositionDigest,
        route: 'ai7-local-deterministic',
        fixtureIdentity: 'sample1-baseline-one-unit-failure',
        sidecarRevision: 2,
      });
      expect(binding.harnessSessionId).toMatch(UUID_PATTERN);
      expect(attempt.spans).toHaveLength(SAMPLE1_UNITS);
      expect(attempt.spans.every((span) => span.harnessSessionId === binding.harnessSessionId && span.endSeq > span.startSeq)).toBe(true);
      expect(attempt.spans.map((span) => span.unitOrdinal)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

      const revision = settled.resultSetRevision!;
      revisionId = revision.revisionId;
      expect(revision.ordinal).toBe(1);
      expect(revision.manuscriptPin.revisionId).toBe(imported.revisionId);
      expect(revision.coverageManifestDigest).toBe(manifest.digest);
      expect(revision.bindingPin).toMatchObject({ attemptId, bindingDigest: binding.bindingDigest, harnessSessionId: binding.harnessSessionId });
      expect(revision.policyPin).toEqual({ operationalScope: 'development-ci', providerProcessingVersion: 'v1', activePolicySetVersion: 'v5', liveTransmissions: 0 });
      // Synchronized delta (#274, #275): eight unit turns, the one cross-unit reduction turn after
      // them, and one assurance sampling turn — both cross-unit findings are anchored in unit 1, so
      // the sample of this Run is one turn.
      expect(revision.usage.requests).toBe(SAMPLE1_UNITS + 2);
      // Four independent axes; no aggregate flag.
      expect(revision.coverage).toMatchObject({ axis: 'coverage', state: 'partial', unitsTotal: 8, unitsClosed: 7, gapCount: 1 });
      expect(revision.reducerClosure).toMatchObject({ axis: 'reducer-closure', state: 'closed-with-gaps' });
      expect(revision.freshness).toMatchObject({ axis: 'freshness', state: 'current', boundRevisionId: imported.revisionId, comparison: 'local-deterministic' });
      expect(revision.assurance).toMatchObject({ axis: 'assurance', state: 'qualified-with-open-conflicts' });
      expect(revision.assurance.unresolvedConflictCount).toBe(revision.conflicts.length);
      expect(JSON.stringify(revision)).not.toMatch(/"complete":/u);
      // Issue #274: the cross-unit reduction ran as one further declared step of this same Run,
      // answered from the fixture's ordinal-0 entry over the seven units that closed.
      expect(revision.reducerClosure.stages.map((stage) => stage.stage)).toEqual([
        'unit-validation', 'section-reduction', 'contradiction-continuity', 'cross-unit-reduction', 'book-synthesis', 'assurance-sampling',
      ]);
      expect(revision.reducerClosure.stages[3]).toEqual({ stage: 'cross-unit-reduction', state: 'closed', inputCount: SAMPLE1_UNITS - 1 });
      expect(revision.crossUnitReduction).toEqual({
        state: 'closed', reason: null,
        requestDigest: 'f165b9f47a625feeb2d38ce95f0298dcaf90de2e8fa927c81463ee8f9b8ff996',
        usage: { inputTokens: 2000, outputTokens: 300 }, findingCount: 2,
      });
      expect(revision.crossUnitFindings.map((finding) => finding.kind)).toEqual(['chronology-conflict', 'continuity-break']);
      expect(revision.assurance.crossUnitFindingCount).toBe(revision.crossUnitFindings.length);

      // Issue #275: the sample ran as one further declared step of this same Run, drawing both
      // cross-unit findings — two is under the default thirty — from the one stratum exact sample1 has.
      expect(revision.reducerClosure.stages[5]).toEqual({ stage: 'assurance-sampling', state: 'closed', inputCount: 2 });
      expect(revision.assuranceSample).toMatchObject({
        state: 'closed', size: 2, candidateCount: 2, reason: null,
        strata: [{ sectionOrdinal: 1, candidates: 2, sampled: 2 }],
        usage: { inputTokens: 1600, outputTokens: 220 },
      });
      expect(revision.assuranceSample.seed).toMatch(DIGEST_PATTERN);
      // One disposition per drawn finding, each naming it by `ref` at its own anchor unit and tier.
      expect(revision.assuranceSample.dispositions.map((entry) => [entry.ref, entry.unitOrdinal, entry.tier, entry.disposition])).toEqual([
        ['0', 1, 'medium', '成立'],
        ['1', 1, 'low', '需降级'],
      ]);
      expect(revision.assuranceSample.dispositions.every((entry) => entry.reason.length > 0)).toBe(true);
      expect(revision.assuranceSample.precision).toEqual([
        { tier: 'low', sampled: 1, upheld: 0, estimate: 0 },
        { tier: 'medium', sampled: 1, upheld: 1, estimate: 1 },
      ]);
      // The axis says what the sample found and keeps the state it already had; no finding moved.
      expect(revision.assurance.sampledPrecision).toEqual({ size: 2, upheld: 1, estimate: 0.5 });
      expect(revision.assurance.label).toContain('· 抽样 2 条 · 估计精度 0.50');
      expect(revision.assurance.state).toBe('qualified-with-open-conflicts');
      // Every finding carries lineage to two distinct closed units, and every block it cites belongs
      // to the unit that side names — the placeholders resolved to this import's own identities.
      for (const finding of revision.crossUnitFindings) {
        expect(finding.unitOrdinals).toEqual([1, 3]);
        for (const side of finding.sides) {
          const unit = manifest.units[side.unitOrdinal - 1]!;
          expect(side.sourceRanges.every((range) => unit.blockIds.includes(range.blockId))).toBe(true);
        }
      }
      // It joined no conflict list — the two projections carry disjoint kind unions, so that is a type
      // guarantee rather than an assertion — and it modified no unit result.
      expect(revision.units.every((unit) => !JSON.stringify(unit).includes('crossUnit'))).toBe(true);
      // The exact gap: unit 2, the adapter failure, with its exact block range.
      const unit2 = manifest.units[1]!;
      expect(revision.gaps).toEqual([{
        unitOrdinal: 2, code: 'adapter-failure', reason: expect.stringContaining('SYNTHETIC_ADAPTER_FAILURE'),
        startPosition: unit2.startPosition, endPosition: unit2.endPosition, blockIds: [...unit2.blockIds],
      }]);
      // The deterministic contradiction pass reported the planted divergences and resolved none.
      expect(revision.conflicts.map((conflict) => conflict.kind)).toEqual(['unit-reported', 'alias-collision', 'entity-kind-divergence', 'setting-claim-divergence']);
      const claim = revision.conflicts.find((conflict) => conflict.kind === 'setting-claim-divergence')!;
      expect(claim.unitOrdinals).toEqual([1, 3]);
      expect(claim.sourceRanges.every((range) => manifest.units.some((unit) => unit.blockIds.includes(range.blockId)))).toBe(true);
      // Unit results: seven closed with exact in-unit ranges, one gap; lineage preserved.
      expect(revision.units.map((unit) => unit.state)).toEqual(['closed', 'gap', 'closed', 'closed', 'closed', 'closed', 'closed', 'closed']);
      const firstUnit = revision.units[0]!;
      expect(firstUnit.state === 'closed' && firstUnit.entities[0]?.sourceRanges[0]?.blockId).toBe(manifest.units[0]!.blockIds[0]);
      expect(firstUnit.state === 'closed' ? firstUnit.usage : null).toEqual({ inputTokens: 1400, outputTokens: 360 });
      expect(revision.synthesis.entities.find((entity) => entity.name === '合成之城')?.unitOrdinals).toEqual([1, 3, 5]);
      expect(revision.sections).toHaveLength(1);
      expect(revision.sections[0]!.gapUnitOrdinals).toEqual([2]);
      // The Task Outcome links the revision.
      expect(settled.taskOutcome).toMatchObject({ classification: 'completed-with-gaps', resultSetRevisionId: revisionId });

      // The Run Report (ADR 0066 §Run Report) is inside the outcome, and it is this Run's own facts.
      const report = settled.taskOutcome!.report!;
      expect(settled.taskOutcome!.reportAbsentReason).toBeNull();
      expect(report).toMatchObject({
        schema: 'ai7.analysis.run-report/1',
        runRecordId: settled.run!.runRecordId,
        taskIntentId: settled.taskIntent!.taskIntentId,
        attemptId,
        resultSetRevisionId: revisionId,
        classification: 'completed-with-gaps',
      });
      // The four stages, with wall time the owner measured and nothing read from a session ledger.
      expect(report.stages.map((stage) => stage.stage)).toEqual([...RUN_REPORT_STAGES]);
      expect(report.stages.map((stage) => stage.state)).toEqual(['closed-with-gaps', 'closed', 'closed', 'closed']);
      expect(report.stages.every((stage) => typeof stage.wallMs === 'number' && stage.wallMs >= 0)).toBe(true);
      expect(report.stages.every((stage) => typeof stage.startedAt === 'string' && typeof stage.settledAt === 'string')).toBe(true);
      // Usage per stage reconciles with the revision's own total, field by field.
      expect(runReportUsageReconciles(report, revision.usage)).toBe(true);
      expect(report.usagePerStage.units.requests + report.usagePerStage['cross-unit-reduction'].requests +
        report.usagePerStage['assurance-sampling'].requests).toBe(revision.usage.requests);
      // The unit accounting is the revision's coverage and lineage, counted rather than restated.
      expect(report.units).toEqual({
        submitted: SAMPLE1_UNITS, reused: 0, recomputed: SAMPLE1_UNITS, gaps: revision.gaps.length, retried: 0,
      });
      expect(report.unitRows.map((row) => row.unitOrdinal)).toEqual(revision.units.map((unit) => unit.unitOrdinal));
      expect(report.unitRows.map((row) => row.state)).toEqual(revision.units.map((unit) => unit.state));
      // Every gap the revision carries appears exactly once, named by its stage and classified code.
      expect(report.failures).toEqual(revision.gaps.map((entry) => ({ stage: 'units', code: entry.code, reason: entry.reason })));
      // The assurance section is a copy of the revision's sample, never a second draw.
      expect(report.assurance).toEqual({
        state: revision.assuranceSample.state,
        seed: revision.assuranceSample.seed,
        size: revision.assuranceSample.size,
        candidateCount: revision.assuranceSample.candidateCount,
        precision: revision.assuranceSample.precision,
        upheld: revision.assuranceSample.dispositions.filter((entry) => entry.disposition === '成立').length,
      });
      // The finding counts name classes and count them; no description, quotation, or range travels.
      expect(report.findingCounts.every((entry) => entry.count > 0)).toBe(true);
      expect(JSON.stringify(report)).not.toContain(revision.synthesis.synopsis);
      for (const finding of revision.crossUnitFindings) expect(JSON.stringify(report)).not.toContain(finding.description);
      // The report's own digest, and the accounting digest that excludes its clocks.
      const { reportDigest, ...body } = report;
      expect(reportDigest).toBe(runReportDigest(body));
      expect(report.accountingDigest).toBe(runReportAccountingDigest(runReportAccountingOf(body)));
      expect(JSON.stringify(runReportAccountingOf(body))).not.toContain('wallMs');
      // The reflection turn closed from its fixture entry, and cost the report alone: it dispatched
      // after the revision was persisted, so the revision's own request count is untouched by it.
      expect(report.ifRedone.state).toBe('closed');
      expect(report.ifRedone.items.length).toBeGreaterThan(0);
      expect(report.ifRedone.reason).toBeNull();
      expect(report.usagePerStage['run-report-reflection'].requests).toBe(1);
      expect(revision.usage.requests).toBe(SAMPLE1_UNITS + 1 + 1);
      // No item names a block, a finding, or a quotation: the message carried none of the three.
      for (const item of report.ifRedone.items) {
        expect(item.suggestion).not.toMatch(/blk_[0-9a-f]{24}/u);
        expect(item.basis).not.toMatch(/blk_[0-9a-f]{24}/u);
        for (const finding of revision.crossUnitFindings) {
          expect(item.suggestion).not.toContain(finding.description);
          expect(item.basis).not.toContain(finding.description);
        }
      }
      reportJson = canonicalJson(report);
      expect(settled.actions).toEqual({ canPrepare: false, canAuthorize: false, canReconfirmPlan: false });
      store.markCleanShutdown();
    } finally {
      await owner.dispose();
      store.close();
    }

    // Restart reads the identical revision from durable state, and an acknowledged edit makes freshness stale.
    const reopened = await openWithRoute(roots.dataRoot, fixture);
    try {
      const restarted = reopened.inspectBaselineAnalysis(bookId);
      expect(restarted.state).toBe('settled');
      expect(restarted.resultSetRevision?.revisionId).toBe(revisionId);
      expect(restarted.resultSetRevision?.freshness.state).toBe('current');
      expect(restarted.run?.attempt?.attemptId).toBe(attemptId);
      // The Run Report survives restart byte for byte: it is durable state, not a live computation.
      expect(canonicalJson(restarted.taskOutcome!.report)).toBe(reportJson);
      expect(restarted.taskOutcome!.reportAbsentReason).toBeNull();
      const window = reopened.getManuscriptWindow(restarted.checkpoint!.manuscriptId, restarted.checkpoint!.branchId, null);
      const block = window.blocks[0]!;
      const acknowledgement = reopened.flushJournalEdit({
        clientEditId: randomUUID(),
        manuscriptId: window.manuscriptId,
        branchId: window.branchId,
        baseRevisionId: window.revisionId,
        blockId: block.blockId,
        windowStartBlockId: block.blockId,
        baseBlockDigest: block.digest,
        expectedJournalSequence: window.journalSequence,
        fromGrapheme: 0,
        toGrapheme: 0,
        insertText: '（L2 基线分析后已确认编辑）',
      });
      expect(acknowledgement.completionLabel).toBe('已写入修订日志');
      const stale = reopened.inspectBaselineAnalysis(bookId);
      expect(stale.resultSetRevision?.revisionId).toBe(revisionId);
      expect(stale.resultSetRevision?.freshness).toMatchObject({ state: 'stale', boundRevisionId: restarted.checkpoint!.revisionId, currentJournalSequence: acknowledgement.sequence });
      expect(stale.resultSetRevision?.coverage).toEqual(restarted.resultSetRevision?.coverage);
      reopened.markCleanShutdown();
    } finally {
      reopened.close();
    }

    // Every analysis relation with rows rejects update and delete in the database itself; a Run without
    // drift or a retry-safe failure leaves the Plan Revision and Plan Adaptation relations empty.
    const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    try {
      expect((database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(FACTUAL_REVIEW_SCHEMA_VERSION);
      const expectedEmpty = new Set(['analysis_plan_revisions', 'analysis_plan_adaptations']);
      for (const table of Object.keys(ANALYSIS_LEDGER_SCHEMA_SQL)) {
        const total = (database.prepare(`SELECT count(*) total FROM ${table}`).get() as { total: number }).total;
        if (expectedEmpty.has(table)) {
          // Their immutability is exercised with rows by the safe-retry and Plan Revision suites below.
          expect(total).toBe(0);
          continue;
        }
        expect(total).toBeGreaterThan(0);
        expect(() => database.prepare(`UPDATE ${table} SET sha256 = sha256`).run()).toThrowError(/TASK_LEDGER_IMMUTABLE/u);
        expect(() => database.prepare(`DELETE FROM ${table}`).run()).toThrowError(/TASK_LEDGER_IMMUTABLE/u);
        expect((database.prepare(`SELECT count(*) total FROM ${table}`).get() as { total: number }).total).toBe(total);
      }
      expect((database.prepare('SELECT count(*) total FROM analysis_unit_results').get() as { total: number }).total).toBe(SAMPLE1_UNITS);
      expect((database.prepare('SELECT count(*) total FROM analysis_plan_versions').get() as { total: number }).total).toBe(1);
      expect(database.prepare('SELECT plan_version FROM analysis_plan_records GROUP BY plan_version').all()).toEqual([{ plan_version: 1 }]);
    } finally {
      database.close();
    }
  }, 300_000);

  it('retries a retry-safe unit failure once inside the unchanged envelope and records the Plan Adaptation', async () => {
    await requireExactSample1(roots.codeRoot);
    const transient = await loadModelFixture(FIXTURES_ROOT, 'sample1-baseline-transient-retry');
    expect(transient.lineage.map((link) => link.identity)).toEqual(['sample1-baseline-transient-retry', 'sample1-baseline-one-unit-failure', 'sample1-baseline-happy']);
    const store = await openWithRoute(roots.dataRoot, transient);
    const owner = new BaselineAnalysisExecutionOwner({ ledger: store.baselineAnalysisLedger, launchPolicy, fixture: transient, secretResolver: fakeSecretResolver() });
    let bookId: string;
    let bindingDigest: string;
    try {
      const imported = await importSample1Book(store, roots.codeRoot, 'L2 sample1 安全重试');
      bookId = imported.bookId;
      await pinEditorialWorkspaceProfileRevision2(store, bookId);
      const credentialReference = recordMissingCredentialConnection(store, 'L2 主编辑连接');
      const prepared = prepare(store, bookId);
      // The Plan Boundary Split and the version ordinal are inside the canonical envelope.
      expect(prepared.planEnvelope?.planVersion).toBe(1);
      expect(prepared.planEnvelope?.boundary).toMatchObject({
        adaptable: [{ adaptationClass: 'safe-retry', label: '安全重试' }],
        participation: { expected: false, statement: '预计无需中途参与' },
      });
      expect(prepared.planEnvelope?.boundary?.material.map((entry) => entry.field)).toEqual([
        'providerBinding.providerId', 'providerBinding.modelId', 'providerBinding.adapterRevision', 'providerBinding.configurationRevision', 'providerBinding.credentialReference',
        'artifactPin.identity', 'artifactPin.version', 'artifactPin.nativeCarrierSha256', 'artifactPin.sidecarRevision', 'artifactPin.sidecarSha256',
        'selectedRange', 'predecessorRevision', 'runBudgetCeiling', 'outboundDataCategory', 'expectedOutcome',
      ]);
      expect(prepared.planVersion).toMatchObject({ ordinal: 1, state: 'current', planRevisionId: null, planEnvelopeDigest: prepared.planEnvelope!.digest });
      expect(prepared.planVersion?.materialInputs).toEqual({
        providerBinding: { providerId: 'deepseek-open-platform', modelId: 'deepseek-v4-pro', adapterRevision: 1, configurationRevision: 1, credentialReference },
        artifactPin: { identity: '@ai7/editorial-workspace-profile', version: '1.0.0', nativeCarrierSha256: 'ae485040c8fa602ab2e98ec91dd122201d40a8be41d8a4f86f7cd55ddb1e434d', sidecarRevision: 2, sidecarSha256: '980b565f25bdff29e539365e17344346017b05146a45cfea35c8ed7d528a1bff' },
        selectedRange: null,
        predecessorRevision: null,
        runBudgetCeiling: 'unset',
        outboundDataCategory: 'public-or-synthetic',
        expectedOutcome: '稿件分析结果集修订版（基线稿件分析契约 v1）',
      });
      expect(prepared.planVersions).toHaveLength(1);
      expect(prepared.planRevisions).toEqual([]);
      expect(prepared.planRevision).toBeNull();
      expect(prepared.actions).toEqual({ canPrepare: false, canAuthorize: true, canReconfirmPlan: false });

      const authorized = store.authorizeBaselineAnalysis(bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
      expect(authorized.projection.authorization).toMatchObject({ planVersionOrdinal: 1, planEnvelopeDigest: prepared.planEnvelope!.digest });
      expect(authorized.projection.planVersion?.state).toBe('bound');
      owner.admitAndDispatch(authorized.dispatchRunRecordId!);
      const settled = await settle(owner, store, bookId);
      expect(settled.state).toBe('settled');
      expect(settled.run?.state).toBe('completed-with-gaps');
      const attempt = settled.run!.attempt!;
      bindingDigest = attempt.executionBinding!.bindingDigest;
      // Nine technical turns: unit 5 twice (attempt 1, then the safe retry as attempt 2); every span names the gate's payload digest.
      expect(attempt.spans.map((span) => [span.unitOrdinal, span.attemptIndex])).toEqual([[1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [5, 2], [6, 1], [7, 1], [8, 1]]);
      expect(attempt.spans.every((span) => span.payloadDigest !== null && DIGEST_PATTERN.test(span.payloadDigest))).toBe(true);
      expect(attempt.spans[5]!.payloadDigest).not.toBe(attempt.spans[4]!.payloadDigest);
      // The adaptation record: one, for unit 5, written for attempt 2 inside the unchanged envelope and binding.
      expect(settled.run!.adaptations).toHaveLength(1);
      const adaptation = settled.run!.adaptations[0]!;
      expect(adaptation).toMatchObject({
        attemptId: attempt.attemptId,
        runRecordId: settled.run!.runRecordId,
        taskIntentId: prepared.taskIntent!.taskIntentId,
        ordinal: 1,
        unitOrdinal: 5,
        adaptationClass: 'safe-retry',
        attemptIndex: 2,
        failureCode: 'PROVIDER_ERROR',
        failureClass: 'adapter-failure',
        failureStatus: 503,
        firstPayloadDigest: attempt.spans[4]!.payloadDigest,
        planEnvelopeDigest: prepared.planEnvelope!.digest,
        bindingDigest,
      });
      expect(adaptation.adaptationId).toMatch(UUID_PATTERN);
      expect(adaptation.requestDigest).toBe(unitRequestDigest(BASELINE_PROMPT_CONTRACT_DIGEST, 5, prepared.coverageManifest!.units[4]!.digest));
      expect(adaptation.classifiedReason).toContain('PROVIDER_ERROR');
      expect(adaptation.label).toBe(`计划内调整 · 单元 5 安全重试 1 次 · ${adaptation.classifiedReason}`);
      // The unit settled from the retry; unit 2's non-retry-safe failure stays a first-attempt gap with no adaptation.
      const revision = settled.resultSetRevision!;
      expect(revision.units.map((unit) => unit.state)).toEqual(['closed', 'gap', 'closed', 'closed', 'closed', 'closed', 'closed', 'closed']);
      expect(revision.units[4]).toMatchObject({ state: 'closed', usage: { inputTokens: 1400, outputTokens: 180 } });
      expect(revision.gaps).toHaveLength(1);
      expect(revision.gaps[0]).toMatchObject({ unitOrdinal: 2, code: 'adapter-failure', reason: expect.stringContaining('SYNTHETIC_ADAPTER_FAILURE') });
      expect(revision.gaps[0]!.reason).not.toContain('安全重试');
      // Synchronized delta (#274, #275): eight units, unit 5's safe retry, the cross-unit reduction,
      // and the one assurance sampling turn anchored in unit 1.
      expect(revision.usage.requests).toBe(11);
      // Token usage sums the seven closed units, the cross-unit reduction's own turn (#274), and the
      // sampling turn (#275); the two failed attempts (unit 2, unit 5's first) report no usage but
      // count as requests.
      expect(revision.usage.inputTokens).toBe(1400 + 1500 + 1500 + 1400 + 1450 + 1500 + 800 + 2000 + 1600);
      expect(revision.provenance).toMatchObject({ runRecordId: settled.run!.runRecordId, planVersion: 1, adaptations: { count: 1, unitOrdinals: [5] } });
      expect(revision.bindingPin.bindingDigest).toBe(bindingDigest);
      expect(revision.coverage).toMatchObject({ unitsTotal: 8, unitsClosed: 7, gapCount: 1 });
      expect(revision.adapterPin.fixtureIdentity).toBe('sample1-baseline-transient-retry');
      // The Run Report of a Run that adapted in-envelope: the retry is counted, and the unit's row
      // carries what both of its attempts cost rather than what its last one did (Issue #276).
      const report = settled.taskOutcome!.report!;
      expect(report.units).toEqual({ submitted: SAMPLE1_UNITS, reused: 0, recomputed: SAMPLE1_UNITS, gaps: 1, retried: 1 });
      expect(report.adaptations).toEqual([{ unitOrdinal: 5, classifiedReason: adaptation.classifiedReason, recordedAt: adaptation.recordedAt }]);
      expect(report.usagePerStage.units.requests).toBe(SAMPLE1_UNITS + 1);
      expect(runReportUsageReconciles(report, revision.usage)).toBe(true);
      expect(report.unitRows[4]).toMatchObject({ unitOrdinal: 5, state: 'closed', attempts: 2 });
      expect(report.ifRedone.state).toBe('closed');
      store.markCleanShutdown();
    } finally {
      await owner.dispose();
      store.close();
    }
    // Restart: the adaptation, the spans, and the bound version persist unchanged.
    const reopened = await openWithRoute(roots.dataRoot, transient);
    try {
      const restarted = reopened.inspectBaselineAnalysis(bookId);
      expect(restarted.run?.adaptations).toHaveLength(1);
      expect(restarted.run?.adaptations[0]).toMatchObject({ unitOrdinal: 5, bindingDigest, attemptIndex: 2 });
      expect(restarted.run?.attempt?.spans.map((span) => span.attemptIndex)).toEqual([1, 1, 1, 1, 1, 2, 1, 1, 1]);
      expect(restarted.authorization?.planVersionOrdinal).toBe(1);
      expect(restarted.resultSetRevision?.provenance.adaptations).toEqual({ count: 1, unitOrdinals: [5] });
      reopened.markCleanShutdown();
    } finally {
      reopened.close();
    }
    const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    try {
      expect((database.prepare('SELECT count(*) total FROM analysis_plan_adaptations').get() as { total: number }).total).toBe(1);
      expect(database.prepare('SELECT ordinal, unit_ordinal, adaptation_class FROM analysis_plan_adaptations').all()).toEqual([{ ordinal: 1, unit_ordinal: 5, adaptation_class: 'safe-retry' }]);
      expect(() => database.prepare('UPDATE analysis_plan_adaptations SET unit_ordinal = 6').run()).toThrowError(/TASK_LEDGER_IMMUTABLE/u);
      expect(() => database.prepare('DELETE FROM analysis_plan_adaptations').run()).toThrowError(/TASK_LEDGER_IMMUTABLE/u);
      expect((database.prepare('SELECT count(*) total FROM analysis_harness_spans').get() as { total: number }).total).toBe(9);
    } finally {
      database.close();
    }
  }, 300_000);

  it('supersedes a prepared plan on material drift, refuses the stale version, and reconfirms the next version on the same Task', async () => {
    await requireExactSample1(roots.codeRoot);
    const store = await openWithRoute(roots.dataRoot, fixture);
    const owner = new BaselineAnalysisExecutionOwner({ ledger: store.baselineAnalysisLedger, launchPolicy, fixture, secretResolver: fakeSecretResolver() });
    const reconfirm = (bookId: string, update: BaselineAnalysisUpdateRequest): BaselineAnalysisProjection => {
      const result = store.createBaselineAnalysisPreparationWork(bookId, BASELINE_ANALYSIS_MODE_GOALS[update.mode], update, launchPolicy, true);
      expect(result.done).toBe(true);
      return result.projection!;
    };
    let bookId: string;
    let taskIntentId: string;
    let v2Digest: string;
    try {
      const imported = await importSample1Book(store, roots.codeRoot, 'L2 sample1 计划修订');
      bookId = imported.bookId;
      await pinEditorialWorkspaceProfileRevision2(store, bookId);
      const credentialReference = recordMissingCredentialConnection(store, 'L2 主编辑连接');
      const first = await runToSettled(store, owner, bookId, null);
      const revision1 = first.settled.resultSetRevision!;
      const options = first.settled.updateControls!.actions['reanalyze-range'].options;
      const rangeA = { startPosition: options[2]!.startPosition, endPosition: options[2]!.endPosition };
      const rangeB = { startPosition: options[7]!.startPosition, endPosition: options[7]!.endPosition };
      /** A third range, so a later proposal and a stale one are each something other than A or B. */
      const rangeC = { startPosition: options[4]!.startPosition, endPosition: options[4]!.endPosition };
      expect(options[2]!.expected).toEqual({ reused: 5, recomputed: 3, invalidated: 1, bypassed: 2 });
      expect(options[7]!.expected).toEqual({ reused: 6, recomputed: 2, invalidated: 1, bypassed: 1 });

      // Version 1 of a `重新分析所选范围` Task over unit 3.
      const prepared = prepare(store, bookId, { mode: 'reanalyze-range', selectedRange: rangeA });
      taskIntentId = prepared.taskIntent!.taskIntentId;
      const v1Digest = prepared.planEnvelope!.digest;
      expect(prepared.planVersion).toMatchObject({ ordinal: 1, state: 'current', planRevisionId: null });
      expect(prepared.planVersion?.materialInputs).toMatchObject({
        providerBinding: { credentialReference },
        selectedRange: rangeA,
        predecessorRevision: { revisionId: revision1.revisionId, ordinal: 1, digest: revision1.digest },
      });
      expect(prepared.update).toMatchObject({ selectedRange: rangeA, reusePlan: { counts: { reused: 5, recomputed: 3, invalidated: 1, bypassed: 2 } } });
      // The same request returns the frozen plan.
      expect(prepare(store, bookId, { mode: 'reanalyze-range', selectedRange: rangeA }).planEnvelope?.digest).toBe(v1Digest);
      expect(() => reconfirm(bookId, { mode: 'reanalyze-range', selectedRange: rangeA })).toThrowError(/ANALYSIS_PLAN_REVISION_ABSENT|没有待重新确认/u);

      // A different range on the prepared Task is material drift: one pending Plan Revision on the same Task Intent, no new version yet.
      const drifted = prepare(store, bookId, { mode: 'reanalyze-range', selectedRange: rangeB });
      expect(drifted.taskIntent?.taskIntentId).toBe(taskIntentId);
      expect(drifted.planVersion).toMatchObject({ ordinal: 1, state: 'superseded' });
      expect(drifted.planVersions).toHaveLength(1);
      expect(drifted.planEnvelope?.digest).toBe(v1Digest);
      expect(drifted.update?.selectedRange).toEqual(rangeA);
      expect(drifted.actions).toEqual({ canPrepare: false, canAuthorize: false, canReconfirmPlan: true });
      const pending = drifted.planRevision!;
      expect(pending.planRevisionId).toMatch(UUID_PATTERN);
      expect(pending).toMatchObject({ priorOrdinal: 1, nextOrdinal: null, trigger: 'prepare', resolved: false, changedFields: ['selectedRange', 'reusePlan.counts'] });
      expect(pending.detectedAt).not.toBeNull();
      expect(pending.diff).toEqual([
        { field: 'selectedRange', label: expect.any(String), prior: rangeA, proposed: rangeB, materiality: 'material' },
        { field: 'reusePlan.counts', label: expect.any(String), prior: { reused: 5, recomputed: 3, invalidated: 1, bypassed: 2 }, proposed: { reused: 6, recomputed: 2, invalidated: 1, bypassed: 1 }, materiality: 'derived' },
      ]);
      expect(pending.proposed).toMatchObject({ selectedRange: rangeB, providerBinding: { credentialReference } });
      expect(pending.label).toBe('计划修订 · 版本 1 → 2（待重新确认） · selectedRange、reusePlan.counts');
      expect(drifted.planRevisions).toHaveLength(1);
      // Inspect re-reads the same pending revision; re-proposing the same range records nothing new.
      expect(store.inspectBaselineAnalysis(bookId).planRevision?.planRevisionId).toBe(pending.planRevisionId);
      expect(prepare(store, bookId, { mode: 'reanalyze-range', selectedRange: rangeB }).planRevisions).toHaveLength(1);

      // Authorizing the stale version is refused with the safe reason and creates no Run Record.
      let refusal: unknown;
      try {
        store.authorizeBaselineAnalysis(bookId, taskIntentId, v1Digest);
      } catch (error) {
        refusal = error;
      }
      expect(refusal).toBeInstanceOf(StoreError);
      expect((refusal as StoreError).code).toBe('ANALYSIS_PLAN_REVISION_REQUIRED');
      expect((refusal as StoreError).message).toContain('plan-revision-required');
      expect(store.inspectBaselineAnalysis(bookId).run).toBeNull();
      expect(store.inspectBaselineAnalysis(bookId).authorization).toBeNull();

      // Issue #281 — a later proposal settles the earlier one durably. Preparing at a third range
      // records a second revision naming the first in `supersedes`; the first row itself is never
      // rewritten, so it keeps the exact diff, proposal, and record time it was written with.
      const superseding = prepare(store, bookId, { mode: 'reanalyze-range', selectedRange: rangeC });
      expect(superseding.planRevisions).toHaveLength(2);
      expect(superseding.planRevisions[0]).toMatchObject({
        planRevisionId: pending.planRevisionId,
        state: 'superseded',
        resolved: true,
        nextOrdinal: null,
        detectedAt: pending.detectedAt,
        label: '计划修订 · 版本 1 → 2（已被后一次修订取代） · selectedRange、reusePlan.counts',
      });
      expect(superseding.planRevisions[0]!.diff).toEqual(pending.diff);
      expect(superseding.planRevisions[0]!.proposed).toEqual(pending.proposed);
      const supersededBy = superseding.planRevisions[1]!;
      expect(supersededBy).toMatchObject({ state: 'pending', resolved: false, trigger: 'prepare', supersedes: [pending.planRevisionId] });
      expect(supersededBy.proposed.selectedRange).toEqual(rangeC);
      expect(superseding.planRevision?.planRevisionId).toBe(supersededBy.planRevisionId);
      expect(superseding.actions).toEqual({ canPrepare: false, canAuthorize: false, canReconfirmPlan: true });

      // The way back through 重新分析所选范围: preparing at the inputs version 1 froze records the revert,
      // settles what was pending, and restores the start action on the version that was never replaced.
      const revertedByPrepare = prepare(store, bookId, { mode: 'reanalyze-range', selectedRange: rangeA });
      expect(revertedByPrepare.planRevisions).toHaveLength(3);
      expect(revertedByPrepare.planRevisions.map((entry) => entry.state)).toEqual(['superseded', 'superseded', 'reverted']);
      const revertRow = revertedByPrepare.planRevisions[2]!;
      expect(revertRow).toMatchObject({
        trigger: 'prepare',
        priorOrdinal: 1,
        nextOrdinal: 1,
        state: 'reverted',
        resolved: true,
        supersedes: [supersededBy.planRevisionId],
        // Unit 5 and unit 3 reuse the same way, so the way back from C names only the range itself.
        changedFields: ['selectedRange'],
        label: '计划修订 · 版本 1 → 1（已回退） · selectedRange',
      });
      expect(revertRow.diff).toEqual([{ field: 'selectedRange', label: expect.any(String), prior: rangeC, proposed: rangeA, materiality: 'material' }]);
      expect(revertRow.proposed).toEqual(prepared.planVersion!.materialInputs);
      expect(revertedByPrepare.planRevision).toBeNull();
      expect(revertedByPrepare.planVersions).toHaveLength(1);
      expect(revertedByPrepare.planVersion).toMatchObject({ ordinal: 1, state: 'current', planEnvelopeDigest: v1Digest });
      expect(revertedByPrepare.planEnvelope?.digest).toBe(v1Digest);
      expect(revertedByPrepare.update?.selectedRange).toEqual(rangeA);
      expect(revertedByPrepare.actions).toEqual({ canPrepare: false, canAuthorize: true, canReconfirmPlan: false });
      // The frozen version is authorizable again, and preparing at the same inputs once more is the
      // ordinary no-op: nothing is pending, so no revert is recorded.
      expect(prepare(store, bookId, { mode: 'reanalyze-range', selectedRange: rangeA }).planRevisions).toHaveLength(3);

      // The same way back through 重新确认计划, which is what the revision surface offers: the inputs
      // equal the frozen version's, so the pending revision is settled and no plan version is written.
      const driftedAgain = prepare(store, bookId, { mode: 'reanalyze-range', selectedRange: rangeB });
      expect(driftedAgain.planRevision).toMatchObject({ state: 'pending', supersedes: [] });
      const revertedByReconfirm = reconfirm(bookId, { mode: 'reanalyze-range', selectedRange: rangeA });
      expect(revertedByReconfirm.planRevisions).toHaveLength(5);
      expect(revertedByReconfirm.planRevisions.map((entry) => entry.state)).toEqual(['superseded', 'superseded', 'reverted', 'superseded', 'reverted']);
      const reconfirmRevert = revertedByReconfirm.planRevisions[4]!;
      expect(reconfirmRevert).toMatchObject({
        trigger: 'reconfirm',
        state: 'reverted',
        nextOrdinal: 1,
        supersedes: [driftedAgain.planRevision!.planRevisionId],
        changedFields: ['selectedRange', 'reusePlan.counts'],
        label: '计划修订 · 版本 1 → 1（已回退） · selectedRange、reusePlan.counts',
      });
      // The way back reads from the proposal that was abandoned to the plan that stands, counts included.
      expect(reconfirmRevert.diff).toEqual([
        { field: 'selectedRange', label: expect.any(String), prior: rangeB, proposed: rangeA, materiality: 'material' },
        { field: 'reusePlan.counts', label: expect.any(String), prior: { reused: 6, recomputed: 2, invalidated: 1, bypassed: 1 }, proposed: { reused: 5, recomputed: 3, invalidated: 1, bypassed: 2 }, materiality: 'derived' },
      ]);
      expect(revertedByReconfirm.planVersions).toHaveLength(1);
      expect(revertedByReconfirm.planEnvelope?.digest).toBe(v1Digest);
      expect(revertedByReconfirm.actions).toEqual({ canPrepare: false, canAuthorize: true, canReconfirmPlan: false });
      expect(() => reconfirm(bookId, { mode: 'reanalyze-range', selectedRange: rangeA })).toThrowError(/ANALYSIS_PLAN_REVISION_ABSENT|没有待重新确认/u);

      // Back to the drift the Task actually means to confirm.
      const pendingFinal = prepare(store, bookId, { mode: 'reanalyze-range', selectedRange: rangeB }).planRevision!;
      expect(pendingFinal).toMatchObject({ state: 'pending', trigger: 'prepare', supersedes: [] });
      // Reconfirming a proposal that is neither the pending one nor the frozen version is still stale.
      expect(() => reconfirm(bookId, { mode: 'reanalyze-range', selectedRange: rangeC })).toThrowError(/ANALYSIS_PLAN_REVISION_STALE|已过期/u);

      // `重新确认计划` yields version 2 on the same Task Intent and resolves the revision.
      const reconfirmed = reconfirm(bookId, { mode: 'reanalyze-range', selectedRange: rangeB });
      v2Digest = reconfirmed.planEnvelope!.digest;
      expect(reconfirmed.taskIntent?.taskIntentId).toBe(taskIntentId);
      expect(reconfirmed.planVersion).toMatchObject({ ordinal: 2, state: 'current', planRevisionId: pendingFinal.planRevisionId, planEnvelopeDigest: v2Digest });
      expect(reconfirmed.planVersions.map((version) => [version.ordinal, version.state])).toEqual([[1, 'superseded'], [2, 'current']]);
      expect(reconfirmed.planVersions[0]!.planEnvelopeDigest).toBe(v1Digest);
      expect(reconfirmed.planRevisions).toHaveLength(6);
      expect(reconfirmed.planRevisions.map((entry) => entry.state)).toEqual(['superseded', 'superseded', 'reverted', 'superseded', 'reverted', 'resolved']);
      expect(reconfirmed.planRevisions[5]).toMatchObject({ planRevisionId: pendingFinal.planRevisionId, priorOrdinal: 1, nextOrdinal: 2, state: 'resolved', resolved: true, label: '计划修订 · 版本 1 → 2 · selectedRange、reusePlan.counts' });
      // Every revision of this Task, whichever way it was settled, asks the editor for nothing now.
      expect(reconfirmed.planRevisions.every((entry) => entry.resolved)).toBe(true);
      expect(reconfirmed.planRevision).toBeNull();
      expect(v2Digest).not.toBe(v1Digest);
      expect(reconfirmed.planEnvelope?.planVersion).toBe(2);
      expect(reconfirmed.coverageManifest?.digest).toBe(prepared.coverageManifest?.digest);
      expect(reconfirmed.checkpoint?.revisionId).toBe(prepared.checkpoint?.revisionId);
      expect(reconfirmed.update).toMatchObject({ selectedRange: rangeB, reusePlan: { counts: { reused: 6, recomputed: 2, invalidated: 1, bypassed: 1 }, recomputeClosure: [8] } });
      expect(reconfirmed.runSourceScope).toMatchObject({ unitScope: { recomputedUnitOrdinals: [2, 8] } });
      expect(reconfirmed.actions).toEqual({ canPrepare: false, canAuthorize: true, canReconfirmPlan: false });
      expect(() => reconfirm(bookId, { mode: 'reanalyze-range', selectedRange: rangeB })).toThrowError(/ANALYSIS_PLAN_REVISION_ABSENT|没有待重新确认/u);

      // The stale version stays refused; version 2 authorizes, binds ordinal 2, and settles a successor revision.
      expect(() => store.authorizeBaselineAnalysis(bookId, taskIntentId, v1Digest)).toThrowError(/plan-revision-required/u);
      const authorized = store.authorizeBaselineAnalysis(bookId, taskIntentId, v2Digest);
      expect(authorized.projection.authorization).toMatchObject({ planVersionOrdinal: 2, planEnvelopeDigest: v2Digest });
      expect(authorized.projection.planVersions.map((version) => version.state)).toEqual(['superseded', 'bound']);
      owner.admitAndDispatch(authorized.dispatchRunRecordId!);
      const settled = await settle(owner, store, bookId);
      const revision2 = settled.resultSetRevision!;
      expect(revision2).toMatchObject({
        ordinal: 2,
        update: { mode: 'reanalyze-range', selectedRange: rangeB, counts: { reused: 6, recomputed: 2, invalidated: 1, bypassed: 1 }, predecessor: { revisionId: revision1.revisionId, ordinal: 1 } },
        provenance: { planVersion: 2, adaptations: { count: 0, unitOrdinals: [] } },
      });
      expect(settled.run!.attempt!.spans.map((span) => span.unitOrdinal)).toEqual([2, 8]);
      expect(settled.run!.attempt!.executionBinding).toMatchObject({ planEnvelopeDigest: v2Digest });
      expect(settled.run!.adaptations).toEqual([]);
      const boundBinding = settled.run!.attempt!.executionBinding!.bindingDigest;

      // An acknowledged manuscript edit after the checkpoint changes no plan version, no revision, and no binding.
      appendToFirstBlock(store, imported.manuscriptId, imported.branchId, J04_EDIT_SUFFIX);
      const edited = store.inspectBaselineAnalysis(bookId);
      expect(edited.planVersions.map((version) => [version.ordinal, version.state])).toEqual([[1, 'superseded'], [2, 'bound']]);
      expect(edited.planRevisions).toHaveLength(6);
      expect(edited.planRevision).toBeNull();
      expect(edited.planEnvelope?.digest).toBe(v2Digest);
      expect(edited.run?.attempt?.executionBinding?.bindingDigest).toBe(boundBinding);
      expect(edited.resultSetRevision?.freshness.state).toBe('stale');
      store.markCleanShutdown();
    } finally {
      await owner.dispose();
      store.close();
    }
    // Restart: every plan version and the resolved revision reopen unchanged; the relations are immutable.
    const reopened = await openWithRoute(roots.dataRoot, fixture);
    try {
      const restarted = reopened.inspectBaselineAnalysis(bookId);
      expect(restarted.taskIntent?.taskIntentId).toBe(taskIntentId);
      expect(restarted.planVersions.map((version) => [version.ordinal, version.state])).toEqual([[1, 'superseded'], [2, 'bound']]);
      expect(restarted.planRevisions[5]).toMatchObject({ priorOrdinal: 1, nextOrdinal: 2, state: 'resolved', resolved: true });
      expect(restarted.authorization?.planVersionOrdinal).toBe(2);
      expect(restarted.planEnvelope?.digest).toBe(v2Digest);
      reopened.markCleanShutdown();
    } finally {
      reopened.close();
    }
    const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    try {
      expect(database.prepare('SELECT ordinal FROM analysis_plan_versions WHERE task_intent_id = ? ORDER BY ordinal').all(taskIntentId)).toEqual([{ ordinal: 1 }, { ordinal: 2 }]);
      expect((database.prepare('SELECT count(*) total FROM analysis_plan_versions').get() as { total: number }).total).toBe(3);
      expect((database.prepare('SELECT count(*) total FROM analysis_plan_revisions').get() as { total: number }).total).toBe(6);
      // Six append-only rows for one supersession, two reverts, and the confirmed drift; the trigger
      // kinds are the paths that recorded them, and only the confirmed one yielded a plan version.
      expect(database.prepare('SELECT trigger_kind, prior_ordinal FROM analysis_plan_revisions ORDER BY rowid').all()).toEqual([
        { trigger_kind: 'prepare', prior_ordinal: 1 },
        { trigger_kind: 'prepare', prior_ordinal: 1 },
        { trigger_kind: 'prepare', prior_ordinal: 1 },
        { trigger_kind: 'prepare', prior_ordinal: 1 },
        { trigger_kind: 'reconfirm', prior_ordinal: 1 },
        { trigger_kind: 'prepare', prior_ordinal: 1 },
      ]);
      expect((database.prepare('SELECT count(*) total FROM analysis_plan_records WHERE task_intent_id = ? AND plan_version = 2').get(taskIntentId) as { total: number }).total).toBe(8);
      for (const table of ['analysis_plan_versions', 'analysis_plan_revisions', 'analysis_plan_records']) {
        expect(() => database.prepare(`UPDATE ${table} SET sha256 = sha256`).run()).toThrowError(/TASK_LEDGER_IMMUTABLE/u);
        expect(() => database.prepare(`DELETE FROM ${table}`).run()).toThrowError(/TASK_LEDGER_IMMUTABLE/u);
      }
    } finally {
      database.close();
    }
  }, 300_000);

  it('records the authorized Run as blocked before dispatch when no local deterministic route is bound', async () => {
    await requireExactSample1(roots.codeRoot);
    const store = await openWithRoute(roots.dataRoot, null);
    try {
      const imported = await importSample1Book(store, roots.codeRoot, 'L2 sample1 无路由');
      await pinEditorialWorkspaceProfileRevision2(store, imported.bookId);
      recordMissingCredentialConnection(store, 'L2 主编辑连接');
      const prepared = prepare(store, imported.bookId);
      expect(prepared.providerResolutionPlan?.executionRoute).toEqual({ kind: 'none', reason: 'j04-model-adapter-control-absent' });
      expect(prepared.planEnvelope).toMatchObject({ dispatchAllowed: false, providerStatus: 'remote-denied-no-route' });
      const authorized = store.authorizeBaselineAnalysis(imported.bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest);
      expect(authorized.dispatchRunRecordId).toBeNull();
      expect(authorized.projection.state).toBe('authorized-blocked');
      expect(authorized.projection.authorization?.authority).toBe('record-only-no-dispatch');
      expect(authorized.projection.run).toMatchObject({ state: 'blocked-before-dispatch', attempt: null, progress: null });
      expect(authorized.projection.run?.blockedReasons?.length).toBe(3);
      expect(authorized.projection.run?.transitions.map((transition) => transition.state)).toEqual(['authorized', 'blocked-before-dispatch']);
      expect(authorized.projection.resultSetRevision).toBeNull();
      // A Run blocked before dispatch records no Task Outcome and therefore no Run Report: its
      // `blocked-before-dispatch` transition and its three reasons are its whole disclosure, and this
      // slice adds neither an outcome for it nor a classification value (Issue #276, revision 2).
      expect(authorized.projection.taskOutcome).toBeNull();
      const owner = new BaselineAnalysisExecutionOwner({ ledger: store.baselineAnalysisLedger, launchPolicy, fixture: null, secretResolver: fakeSecretResolver() });
      expect(() => owner.admitAndDispatch(authorized.projection.run!.runRecordId)).toThrowError(/EXECUTION_ROUTE_ABSENT|没有可执行的本地确定性路由/u);
      // And it stays so after the refused dispatch: nothing invents an outcome to hang a report on.
      expect(store.inspectBaselineAnalysis(imported.bookId).taskOutcome).toBeNull();
      // Authorizing again is idempotent and a stale envelope digest is refused.
      expect(store.authorizeBaselineAnalysis(imported.bookId, prepared.taskIntent!.taskIntentId, prepared.planEnvelope!.digest).projection.authorization?.authorizationId)
        .toBe(authorized.projection.authorization?.authorizationId);
      expect(() => store.authorizeBaselineAnalysis(imported.bookId, prepared.taskIntent!.taskIntentId, 'f'.repeat(64))).toThrowError(StoreError);
      store.markCleanShutdown();
    } finally {
      store.close();
    }
  }, 300_000);

  it('reads a Task Outcome recorded before the Run Report with no report and the disclosed reason', async () => {
    await requireExactSample1(roots.codeRoot);
    const store = await openWithRoute(roots.dataRoot, fixture);
    const owner = new BaselineAnalysisExecutionOwner({ ledger: store.baselineAnalysisLedger, launchPolicy, fixture, secretResolver: fakeSecretResolver() });
    let bookId: string;
    let outcomeId: string;
    try {
      const imported = await importSample1Book(store, roots.codeRoot, 'L2 sample1 早于运行报告的任务结果');
      bookId = imported.bookId;
      await pinEditorialWorkspaceProfileRevision2(store, bookId);
      recordMissingCredentialConnection(store, 'L2 主编辑连接');
      const { settled } = await runToSettled(store, owner, bookId, null);
      outcomeId = settled.taskOutcome!.outcomeId;
      expect(settled.taskOutcome!.report).not.toBeNull();
      store.markCleanShutdown();
    } finally {
      await owner.dispose();
      store.close();
    }

    stripRunReportsFromOutcomes(join(roots.dataRoot, 'store', 'ai7.sqlite'));

    const reopened = await openWithRoute(roots.dataRoot, fixture);
    try {
      const outcome = reopened.inspectBaselineAnalysis(bookId).taskOutcome!;
      // The same outcome, read as exactly what it is: no report, and the absence said in the reader's
      // own language rather than as a null a surface would have to guess at.
      expect(outcome.outcomeId).toBe(outcomeId);
      expect(outcome.classification).toBe('completed-with-gaps');
      expect(outcome.safeNextAction.length).toBeGreaterThan(0);
      expect(outcome.report).toBeNull();
      expect(outcome.reportAbsentReason).toBe(PRE_RUN_REPORT_REASON);
      expect(outcome.reportAbsentReason).toBe('该任务结果由未生成运行报告的运行产生。');
      // Reading it does not rewrite it: the relation is insert-only and stays that way.
      const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
      try {
        expect(() => database.prepare('UPDATE analysis_task_outcomes SET sha256 = sha256').run()).toThrowError(/TASK_LEDGER_IMMUTABLE/u);
        expect(String(tableRows(database, 'analysis_task_outcomes')[0]!.canonical_json)).not.toContain('"report"');
      } finally {
        database.close();
      }
      reopened.markCleanShutdown();
    } finally {
      reopened.close();
    }
  }, 300_000);

  it('appends successor revisions through the three update modes with exact, position-independent lineage', async () => {
    await requireExactSample1(roots.codeRoot);
    const store = await openWithRoute(roots.dataRoot, fixture);
    const owner = new BaselineAnalysisExecutionOwner({ ledger: store.baselineAnalysisLedger, launchPolicy, fixture, secretResolver: fakeSecretResolver() });
    let bookId: string;
    let revisionIds: string[];
    let digests: string[];
    try {
      const imported = await importSample1Book(store, roots.codeRoot, 'L2 sample1 更新与历史');
      bookId = imported.bookId;
      await pinEditorialWorkspaceProfileRevision2(store, bookId);
      recordMissingCredentialConnection(store, 'L2 主编辑连接');
      expect(store.inspectBaselineAnalysis(bookId)).toMatchObject({ state: 'available', updateControls: null, history: null });

      // Revision 1: the first baseline exactly as #92 records it (unit 2 is the fixture's adapter-failure gap).
      const first = await runToSettled(store, owner, bookId, null);
      const revision1 = first.settled.resultSetRevision!;
      expect(revision1).toMatchObject({ ordinal: 1, update: { mode: 'first-baseline', predecessor: null, reusePlanDigest: null, counts: { reused: 0, recomputed: SAMPLE1_UNITS, invalidated: 0, bypassed: 0 } } });
      expect(revision1.lineage.every((entry) => entry.kind === 'recomputed')).toBe(true);
      expect(revision1.coverage).toMatchObject({ unitsTotal: 8, unitsClosed: 7, unitsReused: 0, gapCount: 1 });
      expect(first.settled.update).toBeNull();
      expect(first.settled.history).toMatchObject({ latestOrdinal: 1, entries: [{ ordinal: 1, mode: 'first-baseline', modeLabel: '首次基线分析', current: true, freshness: 'current', predecessor: null, gapCount: 1, conflictCount: 4 }] });
      const controls1 = first.settled.updateControls!;
      expect(controls1).toMatchObject({ target: { ordinal: 1, revisionId: revision1.revisionId, freshness: 'current' }, blockedByActiveRun: false, working: { totalBlocks: SAMPLE1_BLOCKS, unitCount: SAMPLE1_UNITS, journalSequence: 0 } });
      expect(controls1.actions['sync-current']).toMatchObject({ available: false, expected: null });
      expect(controls1.actions['sync-current'].unavailableReason).toContain('已过期');
      // Whole-Book bypasses the seven closed units and invalidates the gap; a range over unit 3 recomputes 2 (gap), 3, and 4.
      expect(controls1.actions['reanalyze-book']).toMatchObject({ available: true, expected: { reused: 0, recomputed: 8, invalidated: 1, bypassed: 7 } });
      expect(controls1.actions['reanalyze-range'].options.map((option) => [option.unitOrdinal, option.startPosition, option.endPosition])).toEqual(
        first.prepared.coverageManifest!.units.map((unit) => [unit.ordinal, unit.startPosition, unit.endPosition]),
      );
      expect(controls1.actions['reanalyze-range'].options[2]).toMatchObject({ unitOrdinal: 3, expected: { reused: 5, recomputed: 3, invalidated: 1, bypassed: 2 } });
      expect(controls1.providerConsequence).toContain('0 次实时传输');
      expect(() => prepare(store, bookId, { mode: 'sync-current', selectedRange: null })).toThrowError(/已过期/u);
      expect(() => prepare(store, bookId)).toThrowError(/已存在结果集修订版/u);
      expect(() => prepare(store, bookId, { mode: 'reanalyze-range', selectedRange: { startPosition: 90, endPosition: 120 } })).toThrowError(/不在任务输入修订版之内/u);

      // The acknowledged edit J-04 makes: the first block changes, so unit 1's content key changes and unit 2 stays a predecessor gap.
      const acknowledgement = appendToFirstBlock(store, imported.manuscriptId, imported.branchId, J04_EDIT_SUFFIX);
      expect(acknowledgement.completionLabel).toBe('已写入修订日志');
      const stale = store.inspectBaselineAnalysis(bookId);
      expect(stale.resultSetRevision!.freshness.state).toBe('stale');
      expect(stale.updateControls!.working.journalSequence).toBe(1);
      expect(stale.updateControls!.actions['sync-current']).toMatchObject({ available: true, expected: { reused: 6, recomputed: 2, invalidated: 2, bypassed: 0 } });

      // Revision 2: 同步到当前稿件.
      const sync = await runToSettled(store, owner, bookId, { mode: 'sync-current', selectedRange: null });
      expect(sync.prepared.taskIntent).toMatchObject({ mode: 'sync-current', modeLabel: '同步到当前稿件', goal: BASELINE_ANALYSIS_MODE_GOALS['sync-current'] });
      expect(sync.prepared.checkpoint!.revisionId).not.toBe(first.prepared.checkpoint!.revisionId);
      expect(sync.prepared.update).toMatchObject({ mode: 'sync-current', predecessorCurrent: true, selectedRange: null, predecessor: { revisionId: revision1.revisionId, ordinal: 1, digest: revision1.digest } });
      const plan2 = sync.prepared.update!.reusePlan!;
      expect(plan2.counts).toEqual({ reused: 6, recomputed: 2, invalidated: 2, bypassed: 0 });
      expect(plan2.units.map((unit) => unit.reason)).toEqual(['no-compatible-predecessor', 'predecessor-gap', 'compatible', 'compatible', 'compatible', 'compatible', 'compatible', 'compatible']);
      expect(plan2.units[2]!.reusedFrom).toEqual({ revisionId: revision1.revisionId, revisionOrdinal: 1, unitOrdinal: 3 });
      expect(missingFixtureEntries(sync.prepared.coverageManifest!, plan2)).toEqual([]);
      expect(sync.prepared.runSourceScope).toMatchObject({ unitScope: { mode: 'sync-current', recomputedUnitOrdinals: [1, 2], reusedUnitOrdinals: [3, 4, 5, 6, 7, 8] } });
      expect(sync.prepared.executionPlan).toMatchObject({ unitCount: 8, recomputedUnitCount: 2, reusedUnitCount: 6 });
      expect(sync.prepared.planEnvelope!.digest).not.toBe(first.prepared.planEnvelope!.digest);
      const revision2 = sync.settled.resultSetRevision!;
      expect(revision2).toMatchObject({ ordinal: 2, resultSetId: revision1.resultSetId, update: { mode: 'sync-current', predecessor: { revisionId: revision1.revisionId, ordinal: 1, digest: revision1.digest }, reusePlanDigest: sync.prepared.update!.reusePlanDigest, counts: plan2.counts } });
      expect(revision2.manuscriptPin.revisionId).toBe(sync.prepared.checkpoint!.revisionId);
      expect(revision2.lineage.map((entry) => entry.kind)).toEqual(['recomputed', 'recomputed', 'reused', 'reused', 'reused', 'reused', 'reused', 'reused']);
      expect(revision2.units[2]).toMatchObject({ lineage: { kind: 'reused', revisionId: revision1.revisionId, revisionOrdinal: 1, unitOrdinal: 3 } });
      const { lineage: _l1, ...reusedSource } = revision1.units[2]!;
      const { lineage: _l2, ...reusedCopy } = revision2.units[2]!;
      expect(reusedCopy).toEqual(reusedSource);
      expect(revision2.units[1]!.state).toBe('gap');
      // Synchronized delta (#274, #275): two recomputed units, the reduction, and the sample. Both run
      // over the complete new unit set — reused units included — and so run in every update mode too.
      expect(revision2.usage.requests).toBe(4);
      expect(revision2.coverage).toMatchObject({ unitsTotal: 8, unitsClosed: 7, unitsReused: 6, gapCount: 1 });
      expect(revision2.coverage.label).toContain('复用 6');
      expect(revision2.freshness).toMatchObject({ state: 'current', boundRevisionId: sync.prepared.checkpoint!.revisionId });
      expect(revision2.assurance.state).toBe('qualified-with-open-conflicts');
      expect(sync.settled.run!.attempt!.spans.map((span) => span.unitOrdinal)).toEqual([1, 2]);
      expect(sync.settled.taskOutcome).toMatchObject({ classification: 'completed-with-gaps', resultSetRevisionId: revision2.revisionId });
      // The predecessor is unchanged and reachable read-only; the latest stays the latest.
      const older = store.inspectBaselineAnalysis(bookId, undefined, revision1.revisionId);
      expect(older.resultSetRevision!.revisionId).toBe(revision2.revisionId);
      expect(older.inspectedRevision).toMatchObject({ current: false, readOnly: true });
      expect(older.inspectedRevision!.revision.freshness.state).toBe('superseded');
      expect(withoutFreshness(older.inspectedRevision!.revision)).toEqual(withoutFreshness(revision1));
      expect(() => store.inspectBaselineAnalysis(bookId, undefined, randomUUID())).toThrowError(StoreError);

      // Revision 3: 重新分析所选范围 over unit 3's range (the range chooser's third option).
      const option = sync.settled.updateControls!.actions['reanalyze-range'].options[2]!;
      expect(option).toMatchObject({ unitOrdinal: 3, expected: { reused: 5, recomputed: 3, invalidated: 1, bypassed: 2 } });
      const range = await runToSettled(store, owner, bookId, { mode: 'reanalyze-range', selectedRange: { startPosition: option.startPosition, endPosition: option.endPosition } });
      const plan3 = range.prepared.update!.reusePlan!;
      expect(range.prepared.update!.selectedRange).toEqual({ startPosition: option.startPosition, endPosition: option.endPosition });
      expect(plan3.recomputeClosure).toEqual([3, 4]);
      expect(plan3.units.map((unit) => unit.reason)).toEqual(['compatible', 'predecessor-gap', 'bypassed-selected-range', 'bypassed-selected-range', 'compatible', 'compatible', 'compatible', 'compatible']);
      expect(plan3.predecessorUnits.map((unit) => unit.disposition)).toEqual(['reused', 'invalidated', 'bypassed', 'bypassed', 'reused', 'reused', 'reused', 'reused']);
      expect(plan3.counts).toEqual({ reused: 5, recomputed: 3, invalidated: 1, bypassed: 2 });
      expect(missingFixtureEntries(range.prepared.coverageManifest!, plan3)).toEqual([]);
      const revision3 = range.settled.resultSetRevision!;
      expect(revision3).toMatchObject({ ordinal: 3, update: { mode: 'reanalyze-range', selectedRange: { startPosition: option.startPosition, endPosition: option.endPosition }, predecessor: { revisionId: revision2.revisionId, ordinal: 2 } } });
      expect(revision3.lineage.map((entry) => entry.kind)).toEqual(['reused', 'recomputed', 'recomputed', 'recomputed', 'reused', 'reused', 'reused', 'reused']);
      expect(revision3.units[0]).toMatchObject({ lineage: { kind: 'reused', revisionOrdinal: 2, unitOrdinal: 1 } });
      // Synchronized delta (#274, #275): three recomputed units, the reduction, and the sample.
      expect(revision3.usage.requests).toBe(5);
      expect(range.settled.run!.attempt!.spans.map((span) => span.unitOrdinal)).toEqual([2, 3, 4]);
      expect(revision3.coverage).toMatchObject({ unitsClosed: 7, unitsReused: 5, gapCount: 1 });

      // Revision 4: 重新分析全书 recomputes every unit and reuses none although the manifest is identical.
      const whole = await runToSettled(store, owner, bookId, { mode: 'reanalyze-book', selectedRange: null });
      const plan4 = whole.prepared.update!.reusePlan!;
      expect(whole.prepared.coverageManifest!.digest).toBe(range.prepared.coverageManifest!.digest);
      expect(plan4.counts).toEqual({ reused: 0, recomputed: 8, invalidated: 1, bypassed: 7 });
      expect(plan4.units.every((unit) => unit.reason === 'bypassed-whole-book')).toBe(true);
      const revision4 = whole.settled.resultSetRevision!;
      expect(revision4).toMatchObject({ ordinal: 4, update: { mode: 'reanalyze-book', predecessor: { revisionId: revision3.revisionId, ordinal: 3 }, counts: plan4.counts } });
      expect(revision4.lineage.every((entry) => entry.kind === 'recomputed')).toBe(true);
      // Synchronized delta (#274, #275): eight recomputed units, the reduction, and the sample.
      expect(revision4.usage.requests).toBe(10);
      expect(revision4.coverage).toMatchObject({ unitsClosed: 7, unitsReused: 0, gapCount: 1 });
      expect(revision4.synthesis).toEqual(revision3.synthesis);

      // The history lists every revision in ordinal order; only the latest is current.
      const history = whole.settled.history!;
      expect(history.latestOrdinal).toBe(4);
      expect(history.entries.map((entry) => [entry.ordinal, entry.mode, entry.current, entry.freshness, entry.predecessor?.ordinal ?? null, entry.usage.requests])).toEqual([
        // Synchronized delta (#274, #275): every Run's count carries its reduction turn and its
        // sampling turn beside its unit turns.
        [1, 'first-baseline', false, 'superseded', null, 10],
        [2, 'sync-current', false, 'superseded', 1, 4],
        [3, 'reanalyze-range', false, 'superseded', 2, 5],
        [4, 'reanalyze-book', true, 'current', 3, 10],
      ]);
      expect(history.entries.map((entry) => entry.counts)).toEqual([revision1.update.counts, plan2.counts, plan3.counts, plan4.counts]);
      expect(history.entries.map((entry) => entry.digest)).toEqual([revision1.digest, revision2.digest, revision3.digest, revision4.digest]);
      expect(history.entries.every((entry) => entry.gapCount === 1 && entry.conflictCount === 4 && entry.producingRun.classification === 'completed-with-gaps')).toBe(true);
      revisionIds = history.entries.map((entry) => entry.revisionId);
      digests = history.entries.map((entry) => entry.digest);
      store.markCleanShutdown();
    } finally {
      await owner.dispose();
      store.close();
    }

    // Restart: the same history and every revision reopen unchanged from durable state.
    const reopened = await openWithRoute(roots.dataRoot, fixture);
    try {
      const restarted = reopened.inspectBaselineAnalysis(bookId);
      expect(restarted.state).toBe('settled');
      expect(restarted.history!.entries.map((entry) => entry.revisionId)).toEqual(revisionIds);
      expect(restarted.resultSetRevision!.ordinal).toBe(4);
      for (const [index, revisionId] of revisionIds.entries()) {
        const view = reopened.inspectBaselineAnalysis(bookId, undefined, revisionId);
        expect(view.inspectedRevision).toMatchObject({ current: index === 3, revision: { ordinal: index + 1, digest: digests[index] } });
      }
      reopened.markCleanShutdown();
    } finally {
      reopened.close();
    }
    const database = new DatabaseSync(join(roots.dataRoot, 'store', 'ai7.sqlite'));
    try {
      expect((database.prepare('SELECT count(*) total FROM analysis_task_intents WHERE book_id = ?').get(bookId) as { total: number }).total).toBe(4);
      expect((database.prepare('SELECT count(*) total FROM analysis_result_set_revisions').get() as { total: number }).total).toBe(4);
      expect(database.prepare("SELECT mode FROM analysis_task_intents ORDER BY created_at").all().map((row) => (row as { mode: string }).mode))
        .toEqual(['first-baseline', 'sync-current', 'reanalyze-range', 'reanalyze-book']);
      expect(() => database.prepare('DELETE FROM analysis_result_set_revisions').run()).toThrowError(/TASK_LEDGER_IMMUTABLE/u);
    } finally {
      database.close();
    }
  }, 300_000);

  it('migrates a revision-15 store forward copying every intent, plan record, and J-03 row byte for byte', async () => {
    await requireExactSample1(roots.codeRoot);
    const databasePath = join(roots.dataRoot, 'store', 'ai7.sqlite');
    const store = await openWithRoute(roots.dataRoot, fixture);
    const owner = new BaselineAnalysisExecutionOwner({ ledger: store.baselineAnalysisLedger, launchPolicy, fixture, secretResolver: fakeSecretResolver() });
    let bookId: string;
    let manuscriptId: string;
    let branchId: string;
    try {
      const imported = await importSample1Book(store, roots.codeRoot, 'L2 sample1 迁移');
      bookId = imported.bookId;
      manuscriptId = imported.manuscriptId;
      branchId = imported.branchId;
      await pinEditorialWorkspaceProfileRevision2(store, bookId);
      recordMissingCredentialConnection(store, 'L2 主编辑连接');
      // One recorded J-03 Task beside the settled first baseline, so the migration has J-03 rows to leave alone.
      let progress = store.createTaskAuthorizationPreparationWork(bookId, J03_TASK_GOAL, launchPolicy);
      while (!progress.done) progress = store.advanceTaskAuthorizationPreparationWork(progress.workId!);
      const j03 = progress.projection!;
      store.authorizeTaskAuthorization(bookId, j03.taskIntent!.taskIntentId, j03.planEnvelope!.digest);
      const first = await runToSettled(store, owner, bookId, null);
      expect(first.settled.resultSetRevision!.ordinal).toBe(1);
      store.markCleanShutdown();
    } finally {
      await owner.dispose();
      store.close();
    }
    const j03Tables = Object.keys(TASK_AUTHORIZATION_SCHEMA_SQL);
    const seededTables = new Set<string>(ANALYSIS_LEDGER_REVISION_17_TABLES);
    const analysisTables = Object.keys(ANALYSIS_LEDGER_SCHEMA_SQL).filter((table) => !seededTables.has(table));
    const before = new DatabaseSync(databasePath, { readOnly: true });
    let j03Before: Record<string, Row[]>;
    let analysisBefore: Record<string, Row[]>;
    let versionsBefore: Row[];
    try {
      j03Before = Object.fromEntries(j03Tables.map((table) => [table, tableRows(before, table)]));
      analysisBefore = Object.fromEntries(analysisTables.map((table) => [table, tableRows(before, table, table === 'analysis_task_intents' ? REVISION_15_INTENT_COLUMNS : '*')]));
      versionsBefore = tableRows(before, 'analysis_plan_versions', 'task_intent_id, ordinal, plan_revision_id, plan_envelope_sha256, created_at');
      expect(j03Before['task_intents']).toHaveLength(1);
      expect(analysisBefore['analysis_task_intents']).toHaveLength(1);
      expect(versionsBefore).toHaveLength(1);
    } finally {
      before.close();
    }
    // Both predecessor revisions migrate forward: 15 (two rebuilt relations) and, after the first migration, 16 (the plan records).
    for (const [downgrade, expectedVersion] of [[downgradeToRevision15, J04_BASELINE_ANALYSIS_SCHEMA_VERSION], [downgradeToRevision16, SUCCESSIVE_TASK_SCHEMA_VERSION]] as const) {
      downgrade(databasePath);
      const downgraded = new DatabaseSync(databasePath, { readOnly: true });
      try {
        expect((downgraded.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(expectedVersion);
        expect(() => downgraded.prepare('SELECT plan_version FROM analysis_plan_records').all()).toThrow();
        expect(() => downgraded.prepare('SELECT count(*) FROM analysis_plan_versions').all()).toThrow();
        if (expectedVersion === J04_BASELINE_ANALYSIS_SCHEMA_VERSION) expect(() => downgraded.prepare('SELECT mode FROM analysis_task_intents').all()).toThrow();
      } finally {
        downgraded.close();
      }
      // Opening the store migrates forward; every pre-17 row is byte for byte the row it was, and the one frozen plan is seeded as version 1.
      const migrated = await openWithRoute(roots.dataRoot, fixture);
      try {
        const after = new DatabaseSync(databasePath, { readOnly: true });
        try {
          expect((after.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(FACTUAL_REVIEW_SCHEMA_VERSION);
          for (const table of j03Tables) expect(tableRows(after, table)).toEqual(j03Before[table]);
          for (const table of analysisTables) {
            expect(tableRows(after, table, table === 'analysis_task_intents' ? REVISION_15_INTENT_COLUMNS : '*')).toEqual(analysisBefore[table]);
          }
          expect(tableRows(after, 'analysis_task_intents', 'mode, predecessor_revision_id, selected_start_position, selected_end_position'))
            .toEqual([{ mode: 'first-baseline', predecessor_revision_id: null, selected_start_position: null, selected_end_position: null }]);
          expect(tableRows(after, 'analysis_plan_versions', 'task_intent_id, ordinal, plan_revision_id, plan_envelope_sha256, created_at')).toEqual(versionsBefore);
          expect(tableRows(after, 'analysis_plan_revisions')).toEqual([]);
          expect(tableRows(after, 'analysis_plan_adaptations')).toEqual([]);
        } finally {
          after.close();
        }
        const restarted = migrated.inspectBaselineAnalysis(bookId);
        expect(restarted).toMatchObject({ state: 'settled', taskIntent: { mode: 'first-baseline' }, history: { latestOrdinal: 1 }, authorization: { planVersionOrdinal: 1 } });
        expect(restarted.planVersions.map((version) => [version.ordinal, version.state])).toEqual([[1, 'bound']]);
        expect(migrated.inspectTaskAuthorization(bookId).state).toBe('authorized');
        migrated.markCleanShutdown();
      } finally {
        migrated.close();
      }
    }

    // The migrated first baseline then serves as the predecessor of a real update.
    const migrated = await openWithRoute(roots.dataRoot, fixture);
    const migratedOwner = new BaselineAnalysisExecutionOwner({ ledger: migrated.baselineAnalysisLedger, launchPolicy, fixture, secretResolver: fakeSecretResolver() });
    try {
      appendToFirstBlock(migrated, manuscriptId, branchId, J04_EDIT_SUFFIX);
      const sync = await runToSettled(migrated, migratedOwner, bookId, { mode: 'sync-current', selectedRange: null });
      expect(sync.settled.resultSetRevision).toMatchObject({ ordinal: 2, update: { mode: 'sync-current', counts: { reused: 6, recomputed: 2, invalidated: 2, bypassed: 0 } }, provenance: { planVersion: 1 } });
      migrated.markCleanShutdown();
    } finally {
      await migratedOwner.dispose();
      migrated.close();
    }
  }, 300_000);

  it('migrates a revision-19 store forward to the two-kind schema with every row byte for byte', async () => {
    await requireExactSample1(roots.codeRoot);
    const databasePath = join(roots.dataRoot, 'store', 'ai7.sqlite');
    const store = await openWithRoute(roots.dataRoot, fixture);
    const owner = new BaselineAnalysisExecutionOwner({ ledger: store.baselineAnalysisLedger, launchPolicy, fixture, secretResolver: fakeSecretResolver() });
    let bookId: string;
    try {
      const imported = await importSample1Book(store, roots.codeRoot, 'L2 sample1 修订版 19 迁移');
      bookId = imported.bookId;
      await pinEditorialWorkspaceProfileRevision2(store, bookId);
      recordMissingCredentialConnection(store, 'L2 主编辑连接');
      const first = await runToSettled(store, owner, bookId, null);
      expect(first.settled.resultSetRevision!.ordinal).toBe(1);
      store.markCleanShutdown();
    } finally {
      await owner.dispose();
      store.close();
    }
    // Every row of the three relations revision 20 rebuilds, exactly as revision 19 wrote them.
    const j03Tables = Object.keys(TASK_AUTHORIZATION_SCHEMA_SQL);
    const analysisTables = Object.keys(ANALYSIS_LEDGER_SCHEMA_SQL);
    const before = new DatabaseSync(databasePath, { readOnly: true });
    let j03Before: Record<string, Row[]>;
    let analysisBefore: Record<string, Row[]>;
    try {
      j03Before = Object.fromEntries(j03Tables.map((table) => [table, tableRows(before, table)]));
      analysisBefore = Object.fromEntries(analysisTables.map((table) => [table, tableRows(before, table)]));
      expect(analysisBefore['analysis_task_intents']).toHaveLength(1);
      expect(analysisBefore['analysis_result_sets']).toHaveLength(1);
      expect(analysisBefore['analysis_result_set_revisions']).toHaveLength(1);
    } finally {
      before.close();
    }

    downgradeToRevision19(databasePath);
    const downgraded = new DatabaseSync(databasePath, { readOnly: true });
    try {
      expect((downgraded.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(TEXT_CONVERSION_SCHEMA_VERSION);
      // The revision-19 CHECKs admit one kind and nothing else, which is what makes this a migration.
      expect(() => downgraded.prepare('SELECT 1').all()).not.toThrow();
    } finally {
      downgraded.close();
    }

    const migrated = await openWithRoute(roots.dataRoot, fixture);
    try {
      const after = new DatabaseSync(databasePath, { readOnly: true });
      try {
        expect((after.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(FACTUAL_REVIEW_SCHEMA_VERSION);
        for (const table of j03Tables) expect(tableRows(after, table)).toEqual(j03Before[table]);
        for (const table of analysisTables) expect(tableRows(after, table)).toEqual(analysisBefore[table]);
        // The widened CHECKs are in place: the second kind is admissible where it was not before.
        const intents = after.prepare("SELECT sql FROM sqlite_schema WHERE name = 'analysis_task_intents'").get() as { sql: string };
        expect(intents.sql).toContain("'factual-review'");
        const sets = after.prepare("SELECT sql FROM sqlite_schema WHERE name = 'analysis_result_sets'").get() as { sql: string };
        expect(sets.sql).toContain("'factual-review'");
        const revisions = after.prepare("SELECT sql FROM sqlite_schema WHERE name = 'analysis_result_set_revisions'").get() as { sql: string };
        expect(revisions.sql).toContain("'ai7.factual-review/1'");
      } finally {
        after.close();
      }
      const restarted = migrated.inspectBaselineAnalysis(bookId);
      expect(restarted).toMatchObject({ state: 'settled', taskIntent: { mode: 'first-baseline' }, history: { latestOrdinal: 1 } });
      expect(migrated.inspectFactualReview(bookId).state).toBe('available');
      migrated.markCleanShutdown();
    } finally {
      migrated.close();
    }
  }, 300_000);

  it('migrates a revision-14 store forward without rewriting any J-03 row', async () => {
    const store = await openWithRoute(roots.dataRoot, null);
    store.markCleanShutdown();
    store.close();
    const databasePath = join(roots.dataRoot, 'store', 'ai7.sqlite');
    const database = new DatabaseSync(databasePath);
    try {
      // Rebuild the exact revision-14 shape: drop only the additive relations and their triggers.
      for (const name of Object.keys(ANALYSIS_LEDGER_TRIGGER_SQL)) database.exec(`DROP TRIGGER ${name}`);
      for (const name of Object.keys(ANALYSIS_LEDGER_SCHEMA_SQL).reverse()) database.exec(`DROP TABLE ${name}`);
      database.exec('PRAGMA user_version = 14');
    } finally {
      database.close();
    }
    const migrated = await openWithRoute(roots.dataRoot, null);
    try {
      await expect(migrated.getStartup()).resolves.toBeDefined();
    } finally {
      migrated.markCleanShutdown();
      migrated.close();
    }
    const verify = new DatabaseSync(databasePath);
    try {
      expect((verify.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(FACTUAL_REVIEW_SCHEMA_VERSION);
      for (const table of Object.keys(ANALYSIS_LEDGER_SCHEMA_SQL)) {
        expect((verify.prepare(`SELECT count(*) total FROM ${table}`).get() as { total: number }).total).toBe(0);
      }
    } finally {
      verify.close();
    }
  }, 120_000);
});
